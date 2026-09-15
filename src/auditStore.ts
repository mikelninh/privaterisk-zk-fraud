import type { Decision } from './engine';

export type AuditEvidence = {
  claim: string;
  source: 'signed-attestation' | 'midnight-plonk';
  issuer?: string;
  expiresAt?: string;
  digest?: string;
};

export type AuditRecord = {
  auditId: string;
  eventId: string;
  transactionId: string;
  correlationId: string;
  createdAt: string;
  policyVersion: string;
  decision: Decision;
  riskScore: number;
  proofLatencyMs?: number;
  networkState: string;
  rawFieldsDisclosed: number;
  evidence: AuditEvidence[];
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'privaterisk.audit.v0.4';
const MAX_RECORDS = 50;

export class BrowserAuditStore {
  constructor(private readonly storage: StorageLike) {}

  list(): AuditRecord[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuditRecord[]) : [];
    } catch {
      return [];
    }
  }

  append(record: AuditRecord): AuditRecord[] {
    const next = [record, ...this.list()].slice(0, MAX_RECORDS);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  count(): number {
    return this.list().length;
  }
}

export function createBrowserAuditStore(): BrowserAuditStore | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return new BrowserAuditStore(window.localStorage);
}
