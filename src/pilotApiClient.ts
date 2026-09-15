import type { FraudEventEnvelope } from './eventEnvelope';
import type { AuditRecord } from './auditStore';
import type { IssuerRegistryEntry, SignedAttestation } from './attestations';

export const PUBLIC_V06_API = 'https://htffcvdopavknnylbowl.supabase.co/functions/v1/privaterisk-v06';

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

export type PreprodProbe = {
  target: 'Midnight Preprod';
  checkedAt: string;
  node: { endpoint: string; reachable: boolean; status: number | null; latencyMs: number; error?: string };
  indexer: { endpoint: string; reachable: boolean; status: number | null; latencyMs: number; error?: string };
  writeState: 'NOT_CONFIGURED';
  contractAddress: null;
  transactionId: null;
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
