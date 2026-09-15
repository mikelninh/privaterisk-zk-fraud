import assert from 'node:assert/strict';
import { createPilotServiceState, issueForEvent, appendAudit, verifyAuditChain } from '../services/pilot-api/core.mjs';

const event = {
  topic: 'payments.transaction.created',
  schemaVersion: '1.0',
  eventId: 'evt_v05_self_test',
  key: 'customer_demo_001',
  occurredAt: new Date().toISOString(),
  payload: {
    transactionId: 'tx_v05_self_test',
    subjectId: 'customer_demo_001',
    amount: 15000,
    currency: 'EUR',
    newDevice: true,
    newRecipient: true,
  },
};

const state = createPilotServiceState();
const firstEvidence = issueForEvent(state, event);
const replayEvidence = issueForEvent(state, event);
assert.equal(firstEvidence.attestations.length, 3);
assert.equal(firstEvidence.registry.length, 3);
assert.equal(firstEvidence.idempotentReplay, false);
assert.equal(replayEvidence.idempotentReplay, true);
assert.equal('privateKey' in firstEvidence.registry[0], false);
assert.equal('publicJwk' in firstEvidence.registry[0], true);

const record = {
  auditId: 'audit_v05_self_test',
  eventId: event.eventId,
  transactionId: event.payload.transactionId,
  correlationId: 'corr_self_test',
  createdAt: new Date().toISOString(),
  policyVersion: 'fraud-policy-v0.5',
  decision: 'CHALLENGE',
  riskScore: 0.81,
  networkState: 'PREPROD_NOT_CONFIGURED',
  rawFieldsDisclosed: 0,
  evidence: [],
};

const firstAudit = await appendAudit(state, { idempotencyKey: 'decision:self-test', record });
const replayAudit = await appendAudit(state, { idempotencyKey: 'decision:self-test', record });
assert.equal(firstAudit.count, 1);
assert.equal(firstAudit.integrity.valid, true);
assert.equal(replayAudit.count, 1);
assert.equal(replayAudit.idempotentReplay, true);

await appendAudit(state, {
  idempotencyKey: 'decision:self-test:2',
  record: { ...record, auditId: 'audit_v05_self_test_2', correlationId: 'corr_self_test_2' },
});
const healthy = await verifyAuditChain(state.auditEntries);
assert.equal(healthy.valid, true);
assert.equal(healthy.count, 2);

const tampered = structuredClone(state.auditEntries);
tampered[0].record.riskScore = 0.01;
const broken = await verifyAuditChain(tampered);
assert.equal(broken.valid, false);
assert.equal(broken.brokenAt, 0);

console.log('PrivateRisk V0.5 pilot API self-test: PASS');
