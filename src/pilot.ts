import type { Transaction, VerifiedClaimInput } from './engine';
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
  appendExternalAudit,
  fetchExternalEvidence,
  fetchPreprodProbe,
  pilotApiBase,
  type PreprodProbe,
  type RemoteAuditReceipt,
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

export type PilotRun = {
  event: FraudEventEnvelope;
  attestations: VerifiedAttestation[];
  attestationFailures: AttestationFailure[];
  proof: LiveProofReceipt | LiveProofFailure;
  evaluation: ReturnType<typeof evaluateTransaction>;
  network: NetworkReceipt;
  preprodProbe: PreprodProbe | null;
  serviceBoundary: ServiceBoundary;
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
      note: 'GitHub Pages fallback: issuer keys are ephemeral browser fixtures because no external pilot API URL is configured.',
    },
  };
}

async function persistAudit(record: AuditRecord, external: boolean): Promise<{ count: number; chain: AuditChainReceipt }> {
  if (external) {
    const receipt: RemoteAuditReceipt = await appendExternalAudit(record);
    return {
      count: receipt.count,
      chain: {
        mode: 'server-hash-chain',
        count: receipt.integrity.count,
        verified: receipt.integrity.valid,
        headHash: receipt.integrity.headHash,
        idempotentReplay: receipt.idempotentReplay,
      },
    };
  }

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

  const audit: AuditRecord = {
    auditId: `audit_${crypto.randomUUID()}`,
    eventId: event.eventId,
    transactionId: event.payload.transactionId,
    correlationId: proof.accepted ? proof.correlationId : event.eventId.slice(0, 16),
    createdAt: new Date().toISOString(),
    policyVersion: proof.accepted ? proof.policyVersion : 'fraud-policy-v0.5',
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
        ? [{
            claim: 'BALANCE_GT_TRANSFER',
            source: 'midnight-plonk' as const,
            digest: proof.proofSha256,
          }]
        : []),
    ],
  };

  const external = evidenceBundle.serviceBoundary.mode === 'external-http';
  const persisted = await persistAudit(audit, external);
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
    audit,
    auditChain: persisted.chain,
    auditCount: persisted.count,
  };
}
