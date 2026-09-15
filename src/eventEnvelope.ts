import type { Transaction } from './engine';

export type FraudEventEnvelope = {
  eventId: string;
  topic: 'payments.transaction.created';
  key: string;
  schemaVersion: '1.0';
  occurredAt: string;
  producer: 'privaterisk-demo-gateway';
  payload: Transaction & {
    transactionId: string;
    subjectId: string;
  };
};

export function createFraudEvent(
  transaction: Transaction,
  options: { transactionId?: string; subjectId?: string; now?: Date } = {},
): FraudEventEnvelope {
  const now = options.now ?? new Date();
  const transactionId = options.transactionId ?? `tx_${crypto.randomUUID()}`;
  const subjectId = options.subjectId ?? 'subject_demo_001';

  return {
    eventId: `evt_${crypto.randomUUID()}`,
    topic: 'payments.transaction.created',
    key: subjectId,
    schemaVersion: '1.0',
    occurredAt: now.toISOString(),
    producer: 'privaterisk-demo-gateway',
    payload: {
      ...transaction,
      transactionId,
      subjectId,
    },
  };
}

export function validateFraudEvent(event: FraudEventEnvelope): void {
  if (event.topic !== 'payments.transaction.created') {
    throw new Error(`Unsupported topic: ${event.topic}`);
  }
  if (event.schemaVersion !== '1.0') {
    throw new Error(`Unsupported fraud-event schema: ${event.schemaVersion}`);
  }
  if (!event.eventId || !event.key || !event.payload.transactionId || !event.payload.subjectId) {
    throw new Error('Fraud event is missing an id, key, transaction id, or subject id.');
  }
  if (!Number.isFinite(event.payload.amount) || event.payload.amount <= 0) {
    throw new Error('Fraud event amount must be positive.');
  }
}
