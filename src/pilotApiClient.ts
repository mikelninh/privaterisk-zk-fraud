import type { FraudEventEnvelope } from './eventEnvelope';
import type { AuditRecord } from './auditStore';
import type { ClaimKey } from './engine';
import type { IssuerRegistryEntry, SignedAttestation } from './attestations';

// Stable public endpoint. The implementation advertises its semantic version via /health.
export const PUBLIC_V06_API = 'https://htffcvdopavknnylbowl.supabase.co/functions/v1/privaterisk-v06';
export const CONTROL_PLANE_POLICY = 'privaterisk-policy-v0.7';

export type RemoteEvidenceBundle = {
  service: string;
  mode: string;
  eventId: string;
  registry: IssuerRegistryEntry[];
  attestations: SignedAttestation[];
  idempotentReplay: boolean;
};

export type RemoteAuditReceipt = {
  entry: {
    index: number;
    previousHash: string;
    receivedAt: string;
    idempotencyKey: string;
    record: AuditRecord;
    hash: string;
  };
  count: number;
  idempotentReplay: boolean;
  integrity: {
    valid: boolean;
    count: number;
    headHash: string | null;
    brokenAt: number | null;
  };
  storage?: string;
};

export type RemoteDecisionReceipt = {
  schemaVersion: 'privaterisk-decision-receipt-v1';
  decisionId: string;
  inputHash: string;
  eventId: string;
  transactionId: string;
  subjectId: string;
  evaluatedAt: string;
  policyVersion: string;
  decision: 'APPROVE' | 'CHALLENGE' | 'REVIEW';
  reasonCode: string;
  riskScore: number;
  claims: Record<ClaimKey, boolean | null>;
  provenance: Record<ClaimKey, string | null>;
  missingClaims: ClaimKey[];
  failedCriticalClaims: ClaimKey[];
  rawFieldsDisclosed: number;
  receiptHash: string;
  decisionLatencyMs: number;
  idempotentReplay: boolean;
};

export type RemoteDecisionResult = {
  receipt: RemoteDecisionReceipt;
  audit: {
    hash: string;
    previousHash: string;
    index: number;
    count?: number;
    integrity: {
      valid: boolean;
      count: number;
      headHash: string | null;
      brokenAt: number | null;
    };
    idempotentReplay: boolean;
  };
};

export type RemoteReplayResult = {
  decisionId: string;
  replayedAt: string;
  policyVersion: string;
  matchesOriginal: boolean;
  original: { decision: string; reasonCode: string; riskScore: number };
  replay: { decision: string; reasonCode: string; riskScore: number };
};

export type RemoteControlMetrics = {
  policyVersion: string;
  decisionsTotal: number;
  byDecision: { APPROVE: number; CHALLENGE: number; REVIEW: number };
  byReason: Record<string, number>;
  approveRate: number;
  challengeRate: number;
  reviewRate: number;
  missingEvidence: number;
  failedCriticalEvidence: number;
  idempotentReplays: number;
  explicitReplays: number;
  replayMismatches: number;
  latencyMs: { samples: number; p50: number | null; p95: number | null };
  truthBoundary: string;
};

export type PreprodProbe = {
  target: 'Midnight Preprod';
  checkedAt: string;
  node: { endpoint: string; reachable: boolean; status: number | null; latencyMs: number; error?: string };
  indexer: { endpoint: string; reachable: boolean; status: number | null; latencyMs: number; error?: string };
  writeState: 'NOT_CONFIGURED' | 'EXTERNAL_DEPLOYMENT_GATE';
  contractAddress: string | null;
  transactionId: string | null;
  note: string;
};

type RegistryWireEntry = Omit<IssuerRegistryEntry, 'publicKey'> & { publicJwk: JsonWebKey };
type EvidenceWireBundle = Omit<RemoteEvidenceBundle, 'registry'> & { registry: RegistryWireEntry[] };

function configuredBase(): string | null {
  const env = (import.meta.env.VITE_PILOT_API_URL as string | undefined)?.trim();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const runtime = params.get('pilotApi');
    if (runtime) return runtime.replace(/\/$/, '');
    if (params.get('localOnly') === '1') return null;
  }
  return PUBLIC_V06_API;
}

export function pilotApiBase(): string | null {
  return configuredBase();
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { message?: string }).message ?? `Pilot API request failed: HTTP ${response.status}`);
  }
  return body as T;
}

async function importRegistry(entries: RegistryWireEntry[]): Promise<IssuerRegistryEntry[]> {
  return Promise.all(entries.map(async (entry) => ({
    issuer: entry.issuer,
    keyId: entry.keyId,
    displayName: entry.displayName,
    allowedClaims: entry.allowedClaims,
    publicKey: await crypto.subtle.importKey(
      'jwk',
      entry.publicJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    ),
  })));
}

export async function fetchExternalEvidence(event: FraudEventEnvelope): Promise<RemoteEvidenceBundle> {
  const base = configuredBase();
  if (!base) throw new Error('External pilot API is not configured.');
  const wire = await responseJson<EvidenceWireBundle>(await fetch(`${base}/v1/attestations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event }),
  }));
  return { ...wire, registry: await importRegistry(wire.registry) };
}

export async function submitExternalDecision(input: {
  event: FraudEventEnvelope;
  claims: Partial<Record<ClaimKey, boolean>>;
  provenance: Partial<Record<ClaimKey, string>>;
}): Promise<RemoteDecisionResult> {
  const base = configuredBase();
  if (!base) throw new Error('External control plane is not configured.');
  return responseJson<RemoteDecisionResult>(await fetch(`${base}/v1/decisions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }));
}

export async function replayExternalDecision(decisionId: string): Promise<RemoteReplayResult> {
  const base = configuredBase();
  if (!base) throw new Error('External control plane is not configured.');
  return responseJson<RemoteReplayResult>(await fetch(`${base}/v1/decisions/${encodeURIComponent(decisionId)}/replay`, {
    method: 'POST',
  }));
}

export async function fetchControlMetrics(): Promise<RemoteControlMetrics> {
  const base = configuredBase();
  if (!base) throw new Error('External control plane is not configured.');
  return responseJson<RemoteControlMetrics>(await fetch(`${base}/v1/metrics`));
}

export async function appendExternalAudit(record: AuditRecord): Promise<RemoteAuditReceipt> {
  const base = configuredBase();
  if (!base) throw new Error('External pilot API is not configured.');
  return responseJson<RemoteAuditReceipt>(await fetch(`${base}/v1/audit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': `decision:${record.eventId}:${record.policyVersion}`,
    },
    body: JSON.stringify({ record }),
  }));
}

export async function fetchPreprodProbe(): Promise<PreprodProbe> {
  const base = configuredBase();
  if (!base) throw new Error('External pilot API is not configured.');
  return responseJson<PreprodProbe>(await fetch(`${base}/v1/network/preprod-health`));
}
