import type { Transaction, VerifiedClaimInput } from './engine';
import { evaluateTransaction } from './engine';
import { createFraudEvent, validateFraudEvent, type FraudEventEnvelope } from './eventEnvelope';
import { createDemoAttestorEnvironment } from './demoAttestors';
import {
  AttestationVerificationError,
  verifyAttestation,
  type AttestedClaimKey,
  type VerifiedAttestation,
} from './attestations';
import { generateLiveBalanceProof, type LiveProofFailure, type LiveProofReceipt } from './liveProof';
import { createBrowserAuditStore, type AuditRecord } from './auditStore';
import { localProofNetworkReceipt, type NetworkReceipt } from './networkAdapter';

export type AttestationFailure = {
  claim: AttestedClaimKey;
  code: string;
  message: string;
};

export type PilotRun = {
  event: FraudEventEnvelope;
  attestations: VerifiedAttestation[];
  attestationFailures: AttestationFailure[];
  proof: LiveProofReceipt | LiveProofFailure;
  evaluation: ReturnType<typeof evaluateTransaction>;
  network: NetworkReceipt;
  audit: AuditRecord;
  auditCount: number;
};

export async function runPilotDecision(transaction: Transaction): Promise<PilotRun> {
  const event = createFraudEvent(transaction);
  validateFraudEvent(event);

  const attestorEnvironment = await createDemoAttestorEnvironment();
  const signed = await attestorEnvironment.issueForEvent(event);
  const attestations: VerifiedAttestation[] = [];
  const attestationFailures: AttestationFailure[] = [];

  for (const attestation of signed) {
    try {
      attestations.push(await verifyAttestation(attestation, attestorEnvironment.registry, {
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
    policyVersion: proof.accepted ? proof.policyVersion : 'fraud-policy-v0.4',
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

  const auditStore = createBrowserAuditStore();
  const auditCount = auditStore ? auditStore.append(audit).length : 0;

  return {
    event,
    attestations,
    attestationFailures,
    proof,
    evaluation,
    network,
    audit,
    auditCount,
  };
}
