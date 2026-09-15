import assert from 'node:assert/strict';
import {
  createPilotServiceState,
  issueForEvent,
  appendAudit,
  verifyAuditChain,
} from '../services/pilot-api/core.mjs';
import {
  POLICY_VERSION,
  controlMetrics,
  evaluateDecision,
  initialiseControlPlane,
  replayDecision,
} from '../services/pilot-api/control-plane.mjs';

function makeEvent(overrides = {}) {
  return {
    topic: 'payments.transaction.created',
    schemaVersion: '1.0',
    eventId: overrides.eventId ?? 'evt_v07_canonical',
    key: 'customer_demo_001',
    occurredAt: new Date().toISOString(),
    payload: {
      transactionId: overrides.transactionId ?? 'tx_v07_canonical',
      subjectId: 'customer_demo_001',
      amount: overrides.amount ?? 15000,
      currency: 'EUR',
      newDevice: overrides.newDevice ?? true,
      newRecipient: overrides.newRecipient ?? true,
    },
  };
}

const allVerified = {
  KYC_VALID: true,
  ACCOUNT_AGE_GT_365: true,
  NO_ACTIVE_COMPROMISE: true,
  BALANCE_GT_TRANSFER: true,
};

const provenance = {
  KYC_VALID: 'signed-attestation:identity',
  ACCOUNT_AGE_GT_365: 'signed-attestation:bank-core',
  NO_ACTIVE_COMPROMISE: 'signed-attestation:fraud-intel',
  BALANCE_GT_TRANSFER: 'midnight-proof:compact-plonk',
};

const state = initialiseControlPlane(createPilotServiceState());

// Existing trust-service guarantees remain intact.
const firstEvidence = issueForEvent(state, makeEvent());
const replayEvidence = issueForEvent(state, makeEvent());
assert.equal(firstEvidence.attestations.length, 3);
assert.equal(firstEvidence.registry.length, 3);
assert.equal(firstEvidence.idempotentReplay, false);
assert.equal(replayEvidence.idempotentReplay, true);
assert.equal('privateKey' in firstEvidence.registry[0], false);
assert.equal('publicJwk' in firstEvidence.registry[0], true);

// Canonical fraud case: all trust claims pass, but transaction context is risky.
const canonical = evaluateDecision(state, {
  event: makeEvent(),
  claims: allVerified,
  provenance,
});
assert.equal(canonical.policyVersion, POLICY_VERSION);
assert.equal(canonical.decision, 'CHALLENGE');
assert.equal(canonical.reasonCode, 'ELEVATED_TRANSACTION_RISK');
assert.equal(canonical.rawFieldsDisclosed, 0);
assert.match(canonical.receiptHash, /^[a-f0-9]{64}$/);

// Same input is idempotent: same decision identity, no double-counted decision.
const canonicalReplay = evaluateDecision(state, {
  event: makeEvent(),
  claims: allVerified,
  provenance,
});
assert.equal(canonicalReplay.decisionId, canonical.decisionId);
assert.equal(canonicalReplay.receiptHash, canonical.receiptHash);
assert.equal(canonicalReplay.idempotentReplay, true);

// Low-risk, fully verified payment can pass.
const safe = evaluateDecision(state, {
  event: makeEvent({ eventId: 'evt_v07_safe', transactionId: 'tx_v07_safe', amount: 85, newDevice: false, newRecipient: false }),
  claims: allVerified,
  provenance,
});
assert.equal(safe.decision, 'APPROVE');
assert.equal(safe.reasonCode, 'POLICY_REQUIREMENTS_SATISFIED');

// Missing evidence fails closed to REVIEW rather than silently approving.
const missingBalanceClaims = { ...allVerified };
delete missingBalanceClaims.BALANCE_GT_TRANSFER;
const missingEvidence = evaluateDecision(state, {
  event: makeEvent({ eventId: 'evt_v07_missing', transactionId: 'tx_v07_missing' }),
  claims: missingBalanceClaims,
  provenance,
});
assert.equal(missingEvidence.decision, 'REVIEW');
assert.equal(missingEvidence.reasonCode, 'MISSING_CRITICAL_EVIDENCE');
assert.deepEqual(missingEvidence.missingClaims, ['BALANCE_GT_TRANSFER']);

// Failed compromise evidence also routes to human review.
const compromised = evaluateDecision(state, {
  event: makeEvent({ eventId: 'evt_v07_compromised', transactionId: 'tx_v07_compromised' }),
  claims: { ...allVerified, NO_ACTIVE_COMPROMISE: false },
  provenance,
});
assert.equal(compromised.decision, 'REVIEW');
assert.equal(compromised.reasonCode, 'FAILED_CRITICAL_EVIDENCE');

// Replay under the same policy must reproduce the same operational outcome.
const explicitReplay = replayDecision(state, canonical.decisionId);
assert.equal(explicitReplay.matchesOriginal, true);
assert.equal(explicitReplay.original.decision, 'CHALLENGE');
assert.equal(explicitReplay.replay.decision, 'CHALLENGE');

const metrics = controlMetrics(state);
assert.equal(metrics.decisionsTotal, 4);
assert.equal(metrics.byDecision.APPROVE, 1);
assert.equal(metrics.byDecision.CHALLENGE, 1);
assert.equal(metrics.byDecision.REVIEW, 2);
assert.equal(metrics.idempotentReplays, 1);
assert.equal(metrics.explicitReplays, 1);
assert.equal(metrics.replayMismatches, 0);
assert.equal(metrics.missingEvidence, 1);
assert.equal(metrics.failedCriticalEvidence, 1);
assert.equal(metrics.latencyMs.samples, 4);
assert.match(metrics.truthBoundary, /not fraud precision/i);

// Hash-chain audit remains tamper-evident.
const record = {
  auditId: 'audit_v07_self_test',
  eventId: canonical.eventId,
  transactionId: canonical.transactionId,
  correlationId: canonical.decisionId,
  createdAt: canonical.evaluatedAt,
  policyVersion: canonical.policyVersion,
  decision: canonical.decision,
  reasonCode: canonical.reasonCode,
  riskScore: canonical.riskScore,
  receiptHash: canonical.receiptHash,
  networkState: 'PREPROD_EXTERNAL_GATE',
  rawFieldsDisclosed: 0,
  evidence: [],
};

const firstAudit = await appendAudit(state, { idempotencyKey: `decision:${canonical.decisionId}`, record });
const replayAudit = await appendAudit(state, { idempotencyKey: `decision:${canonical.decisionId}`, record });
assert.equal(firstAudit.count, 1);
assert.equal(firstAudit.integrity.valid, true);
assert.equal(replayAudit.count, 1);
assert.equal(replayAudit.idempotentReplay, true);

await appendAudit(state, {
  idempotencyKey: 'decision:self-test:2',
  record: { ...record, auditId: 'audit_v07_self_test_2', correlationId: 'corr_self_test_2' },
});
const healthy = await verifyAuditChain(state.auditEntries);
assert.equal(healthy.valid, true);
assert.equal(healthy.count, 2);

const tampered = structuredClone(state.auditEntries);
tampered[0].record.riskScore = 0.01;
const broken = await verifyAuditChain(tampered);
assert.equal(broken.valid, false);
assert.equal(broken.brokenAt, 0);

console.log('PrivateRisk V0.7 operational control-plane self-test: PASS');
