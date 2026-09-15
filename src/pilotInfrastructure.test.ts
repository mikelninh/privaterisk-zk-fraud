import { describe, expect, it } from 'vitest';
import { createFraudEvent, validateFraudEvent } from './eventEnvelope';
import { BrowserAuditStore, type AuditRecord } from './auditStore';
import { assertNetworkReceiptTruth, localProofNetworkReceipt } from './networkAdapter';

const tx = {
  amount: 15_000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('V0.4 integration primitives', () => {
  it('creates a Kafka-compatible event envelope with explicit schema and key', () => {
    const event = createFraudEvent(tx, {
      transactionId: 'tx_test',
      subjectId: 'subject_test',
      now: new Date('2026-09-15T08:00:00.000Z'),
    });
    expect(() => validateFraudEvent(event)).not.toThrow();
    expect(event.topic).toBe('payments.transaction.created');
    expect(event.key).toBe('subject_test');
    expect(event.schemaVersion).toBe('1.0');
    expect(event.payload.transactionId).toBe('tx_test');
  });

  it('keeps audit records append-only and persistent through a storage boundary', () => {
    const storage = new MemoryStorage();
    const storeA = new BrowserAuditStore(storage);
    const record: AuditRecord = {
      auditId: 'audit_1',
      eventId: 'evt_1',
      transactionId: 'tx_1',
      correlationId: 'corr_1',
      createdAt: '2026-09-15T08:00:00.000Z',
      policyVersion: 'fraud-policy-v0.4',
      decision: 'CHALLENGE',
      riskScore: 0.81,
      proofLatencyMs: 400,
      networkState: 'PREPROD_NOT_CONFIGURED',
      rawFieldsDisclosed: 0,
      evidence: [],
    };
    storeA.append(record);

    const storeB = new BrowserAuditStore(storage);
    expect(storeB.count()).toBe(1);
    expect(storeB.list()[0].auditId).toBe('audit_1');
  });

  it('does not allow a submitted network state without concrete chain identifiers', () => {
    expect(() => assertNetworkReceiptTruth(localProofNetworkReceipt())).not.toThrow();
    expect(() => assertNetworkReceiptTruth({
      ...localProofNetworkReceipt(),
      target: 'preprod',
      state: 'PREPROD_SUBMITTED',
    })).toThrow('requires both contract address and transaction id');
  });
});
