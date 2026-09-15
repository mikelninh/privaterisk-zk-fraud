import type { ClaimKey, Transaction, VerifiedClaimInput, VerifiedEvidence } from './engine';
import { evaluateTransaction } from './engine';
import { createFraudEvent, validateFraudEvent, type FraudEventEnvelope } from './eventEnvelope';
import { createDemoAttestorEnvironment } from './demoAttestors';
import {
  AttestationVerificationError,
  verifyAttestation,
  type AttestedClaimKey,
  type VerifiedAttestation,
  type SignedAttestation,
  type IssuerRegistryEntry,
} from './attestations';
import { generateLiveBalanceProof, type LiveProofFailure, type LiveProofReceipt } from './liveProof';
import { createBrowserAuditStore, type AuditRecord } from './auditStore';
import { localProofNetworkReceipt, type NetworkReceipt } from './networkAdapter';
import {
  CONTROL_PLANE_POLICY,
  fetchControlMetrics,
  fetchExternalEvidence,
  fetchPreprodProbe,
  pilotApiBase,
  replayExternalDecision,
  submitExternalDecision,
  type PreprodProbe,
  type RemoteControlMetrics,
  type RemoteDecisionResult,
} from './pilotApiClient';

export type AttestationFailure = {
  claim: AttestedClaimKey;
  code: string;
  message: string;
};

export type ServiceBoundary = {
  mode: 'external-http' | 'browser-fallback';
  endpoint: string | null;
  signingKeys: 'service-side' | 'browser-ephemeral-demo';
  note: string;
};

export type AuditChainReceipt = {
  mode: 'server-hash-chain' | 'browser-local';
  count: number;
  verified: boolean;
  headHash: string | null;
  idempotentReplay: boolean;
};

export type ControlPlaneReceipt = {
  decisionId: string;
  receiptHash: string;
  policyVersion: string;
  reasonCode: string;
  decisionLatencyMs: number;
  replayVerified: boolean;
};

export type PilotRun = {
  event: FraudEventEnvelope;
  attestations: VerifiedAttestation[];
  attestationFailures: AttestationFailure[];
  proof: LiveProofReceipt | LiveProofFailure;
  evaluation: ReturnType<typeof evaluateTransaction>;
  network: NetworkReceipt;
  preprodProbe: PreprodProbe | null;
  serviceBoundary: ServiceBoundary;
  controlPlane: ControlPlaneReceipt | null;
  controlMetrics: RemoteControlMetrics | null;
  audit: AuditRecord;
  auditChain: AuditChainReceipt;
  auditCount: number;
};

type EvidenceBundle = {
  signed: SignedAttestation[];
  registry: IssuerRegistryEntry[];
  serviceBoundary: ServiceBoundary;
};

async function evidenceForEvent(event: FraudEventEnvelope): Promise<EvidenceBundle> {
  const base = pilotApiBase();
  if (base) {
    const remote = await fetchExternalEvidence(event);
    return {
      signed: remote.attestations,
      registry: remote.registry,
      serviceBoundary: {
        mode: 'external-http',
        endpoint: base,
        signingKeys: 'service-side',
        note: 'Issuer signing keys remain inside the pilot API process. The browser receives only signed claims and public verification keys.',
      },
    };
  }

  const local = await createDemoAttestorEnvironment();
  return {
    signed: await local.issueForEvent(event),
    registry: local.registry,
    serviceBoundary: {
      mode: 'browser-fallback',
      endpoint: null,
      signingKeys: 'browser-ephemeral-demo',
      note: 'Local-only fallback: issuer keys are ephemeral browser fixtures because no external pilot API URL is configured.',
    },
  };
}

function claimBoolean(value: boolean | VerifiedEvidence | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return value?.value;
}

function controlInput(event: FraudEventEnvelope, verifiedClaims: VerifiedClaimInput, attestations: VerifiedAttestation[], proof: LiveProofReceipt | LiveProofFailure) {
  const claims: Partial<Record<ClaimKey, boolean>> = {};
  const provenance: Partial<Record<ClaimKey, string>> = {};
  const keys: ClaimKey[] = ['KYC_VALID', 'ACCOUNT_AGE_GT_365', 'NO_ACTIVE_COMPROMISE', 'BALANCE_GT_TRANSFER'];
  for (const key of keys) {
    const value = claimBoolean(verifiedClaims[key]);
    if (value !== undefined) claims[key] = value;
  }
  for (const attestation of attestations) {
    provenance[attestation.claim] = `signed-attestation:${attestation.issuer}`;
  }
  provenance.BALANCE_GT_TRANSFER = proof.accepted
    ? `midnight-proof:${proof.proofSha256}`
    : 'midnight-proof:unavailable';
  return { event, claims, provenance };
}

function localAudit(record: AuditRecord): { count: number; chain: AuditChainReceipt } {
  const store = createBrowserAuditStore();
  const count = store ? store.append(record).length : 0;
  return {
    count,
    chain: {
      mode: 'browser-local',
      count,
      verified: false,
      headHash: null,
      idempotentReplay: false,
    },
  };
}

function remoteAudit(result: RemoteDecisionResult): { count: number; chain: AuditChainReceipt } {
  return {
    count: result.audit.integrity.count,
    chain: {
      mode: 'server-hash-chain',
      count: result.audit.integrity.count,
      verified: result.audit.integrity.valid,
      headHash: result.audit.integrity.headHash,
      idempotentReplay: result.audit.idempotentReplay,
    },
  };
}

export async function runPilotDecision(transaction: Transaction): Promise<PilotRun> {
  const event = createFraudEvent(transaction);
  validateFraudEvent(event);

  const evidenceBundle = await evidenceForEvent(event);
  const attestations: VerifiedAttestation[] = [];
  const attestationFailures: AttestationFailure[] = [];

  for (const attestation of evidenceBundle.signed) {
    try {
      attestations.push(await verifyAttestation(attestation, evidenceBundle.registry, {
        subjectId: event.payload.subjectId,
        eventId: event.eventId,
      }));
    } catch (error) {
      const code = error instanceof AttestationVerificationError ? error.code : 'INTERNAL';
      attestationFailures.push({
        claim: attestation.body.claim,
        code,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const verifiedClaims: VerifiedClaimInput = {
    KYC_VALID: { value: false, source: 'signed-attestation' },
    ACCOUNT_AGE_GT_365: { value: false, source: 'signed-attestation' },
    NO_ACTIVE_COMPROMISE: { value: false, source: 'signed-attestation' },
    BALANCE_GT_TRANSFER: { value: false, source: 'midnight-proof' },
  };

  for (const attestation of attestations) {
    verifiedClaims[attestation.claim] = {
      value: attestation.value,
      source: 'signed-attestation',
      issuer: attestation.displayName,
    };
  }

  const proof = await generateLiveBalanceProof(transaction.amount);
  if (proof.accepted) {
    verifiedClaims.BALANCE_GT_TRANSFER = { value: true, source: 'midnight-proof' };
  }

  const evaluation = evaluateTransaction(transaction, verifiedClaims);
  const network = localProofNetworkReceipt();
  const external = evidenceBundle.serviceBoundary.mode === 'external-http';

  let remoteDecision: RemoteDecisionResult | null = null;
  let controlPlane: ControlPlaneReceipt | null = null;
  let controlMetrics: RemoteControlMetrics | null = null;

  if (external) {
    remoteDecision = await submitExternalDecision(controlInput(event, verifiedClaims, attestations, proof));

    // Independent local + remote deterministic policy calculation is deliberate:
    // any disagreement becomes a fail-closed runtime error rather than silently
    // accepting whichever component happened to answer last.
    if (
      remoteDecision.receipt.decision !== evaluation.decision ||
      remoteDecision.receipt.riskScore !== evaluation.riskScore
    ) {
      throw new Error(
        `CONTROL_PLANE_MISMATCH: local=${evaluation.decision}/${evaluation.riskScore} remote=${remoteDecision.receipt.decision}/${remoteDecision.receipt.riskScore}`,
      );
    }

    const replay = await replayExternalDecision(remoteDecision.receipt.decisionId);
    if (!replay.matchesOriginal) {
      throw new Error(`CONTROL_PLANE_REPLAY_MISMATCH: ${remoteDecision.receipt.decisionId}`);
    }

    controlPlane = {
      decisionId: remoteDecision.receipt.decisionId,
      receiptHash: remoteDecision.receipt.receiptHash,
      policyVersion: remoteDecision.receipt.policyVersion,
      reasonCode: remoteDecision.receipt.reasonCode,
      decisionLatencyMs: remoteDecision.receipt.decisionLatencyMs,
      replayVerified: replay.matchesOriginal,
    };
    controlMetrics = await fetchControlMetrics();
  }

  const audit: AuditRecord = {
    auditId: remoteDecision ? `audit_${remoteDecision.receipt.receiptHash.slice(0, 24)}` : `audit_${crypto.randomUUID()}`,
    eventId: event.eventId,
    transactionId: event.payload.transactionId,
    correlationId: remoteDecision?.receipt.decisionId ?? (proof.accepted ? proof.correlationId : event.eventId.slice(0, 16)),
    createdAt: remoteDecision?.receipt.evaluatedAt ?? new Date().toISOString(),
    policyVersion: remoteDecision?.receipt.policyVersion ?? CONTROL_PLANE_POLICY,
    decision: evaluation.decision,
    riskScore: evaluation.riskScore,
    proofLatencyMs: proof.accepted ? proof.totalMs : undefined,
    networkState: network.state,
    rawFieldsDisclosed: evaluation.rawFieldsDisclosed,
    evidence: [
      ...attestations.map((attestation) => ({
        claim: attestation.claim,
        source: 'signed-attestation' as const,
        issuer: attestation.displayName,
        expiresAt: attestation.expiresAt,
        digest: attestation.signatureDigest,
      })),
      ...(proof.accepted
        ? [{ claim: 'BALANCE_GT_TRANSFER', source: 'midnight-plonk' as const, digest: proof.proofSha256 }]
        : []),
    ],
  };

  const persisted = remoteDecision ? remoteAudit(remoteDecision) : localAudit(audit);
  const preprodProbe = external ? await fetchPreprodProbe().catch(() => null) : null;

  return {
    event,
    attestations,
    attestationFailures,
    proof,
    evaluation,
    network,
    preprodProbe,
    serviceBoundary: evidenceBundle.serviceBoundary,
    controlPlane,
    controlMetrics,
    audit,
    auditChain: persisted.chain,
    auditCount: persisted.count,
  };
}
