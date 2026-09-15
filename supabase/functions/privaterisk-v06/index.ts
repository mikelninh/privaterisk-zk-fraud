const ATTESTED_CLAIMS = ['KYC_VALID', 'ACCOUNT_AGE_GT_365', 'NO_ACTIVE_COMPROMISE'] as const;
const REQUIRED_CLAIMS = ['KYC_VALID', 'ACCOUNT_AGE_GT_365', 'NO_ACTIVE_COMPROMISE', 'BALANCE_GT_TRANSFER'] as const;
const POLICY_VERSION = 'privaterisk-policy-v0.7';
const DECISION_SCHEMA_VERSION = 'privaterisk-decision-receipt-v1';
const PREPROD = {
  node: 'https://rpc.preprod.midnight.network',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
};

type Claim = typeof ATTESTED_CLAIMS[number];
type RequiredClaim = typeof REQUIRED_CLAIMS[number];
type Issuer = {
  issuer: string;
  keyId: string;
  displayName: string;
  allowedClaims: Claim[];
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
};
type DecisionRow = {
  decision_id: string;
  input_hash: string;
  event_id: string;
  transaction_id: string;
  subject_id: string;
  evaluated_at: string;
  policy_version: string;
  decision: 'APPROVE' | 'CHALLENGE' | 'REVIEW';
  reason_code: string;
  risk_score: number;
  claims: Record<RequiredClaim, boolean | null>;
  provenance: Record<RequiredClaim, string | null>;
  missing_claims: RequiredClaim[];
  failed_critical_claims: RequiredClaim[];
  raw_fields_disclosed: number;
  receipt_hash: string;
  decision_latency_ms: number;
  request: any;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const enc = new TextEncoder();
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type,idempotency-key',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'content-type': 'application/json',
  'cache-control': 'no-store',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors });
}

function b64url(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(stable(value));
}

async function sha256Hex(value: unknown) {
  const bytes = enc.encode(typeof value === 'string' ? value : stableStringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bodyBytes(body: any) {
  return enc.encode(JSON.stringify([
    body.version,
    body.issuer,
    body.keyId,
    body.subjectId,
    body.eventId,
    body.claim,
    body.value,
    body.issuedAt,
    body.expiresAt,
    body.nonce,
  ]));
}

async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase service-role database environment is unavailable.');
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Database request failed ${response.status}: ${text}`);
  return data;
}

async function makeIssuer(issuer: string, displayName: string, allowedClaims: Claim[]): Promise<Issuer> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  return {
    issuer,
    keyId: `${issuer}#edge-es256-v1`,
    displayName,
    allowedClaims,
    privateKey: pair.privateKey,
    publicJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
  };
}

const issuerState = Promise.all([
  makeIssuer('did:privaterisk:identity-edge', 'PrivateRisk Identity Attestor', ['KYC_VALID']),
  makeIssuer('did:privaterisk:bank-edge', 'PrivateRisk Bank Attestor', ['ACCOUNT_AGE_GT_365']),
  makeIssuer('did:privaterisk:fraud-edge', 'PrivateRisk Fraud Attestor', ['NO_ACTIVE_COMPROMISE']),
]).then((issuers) => ({
  startedAt: new Date().toISOString(),
  issuers,
  evidence: new Map<string, any>(),
}));

function validateEvent(event: any) {
  if (!event || event.topic !== 'payments.transaction.created' || event.schemaVersion !== '1.0') {
    throw new Error('Unsupported event envelope.');
  }
  if (!event.eventId || !event.key || !event.payload?.subjectId || !event.payload?.transactionId) {
    throw new Error('Missing event identifiers.');
  }
  if (event.key !== event.payload.subjectId) throw new Error('Event key must equal subject id.');
  return event;
}

async function signClaim(body: any, issuer: Issuer) {
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    issuer.privateKey,
    bodyBytes(body),
  ));
  return { alg: 'ES256', body, signature: b64url(signature) };
}

function registry(issuers: Issuer[]) {
  return issuers.map((issuer) => ({
    issuer: issuer.issuer,
    keyId: issuer.keyId,
    displayName: issuer.displayName,
    allowedClaims: issuer.allowedClaims,
    publicJwk: issuer.publicJwk,
  }));
}

async function issue(event: any) {
  const state = await issuerState;
  validateEvent(event);
  const existing = state.evidence.get(event.eventId);
  if (existing) return { ...existing, idempotentReplay: true };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  const byClaim = new Map<Claim, Issuer>();
  for (const issuer of state.issuers) {
    for (const claim of issuer.allowedClaims) byClaim.set(claim, issuer);
  }

  const attestations = await Promise.all(ATTESTED_CLAIMS.map(async (claim) => {
    const issuer = byClaim.get(claim)!;
    const body = {
      version: 'privaterisk-attestation-v1',
      issuer: issuer.issuer,
      keyId: issuer.keyId,
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
      claim,
      value: true,
      issuedAt: now.toISOString(),
      expiresAt,
      nonce: crypto.randomUUID(),
    };
    return signClaim(body, issuer);
  }));

  const result = {
    service: 'privaterisk-v06',
    version: '0.7.0',
    mode: 'public-supabase-edge',
    eventId: event.eventId,
    registry: registry(state.issuers),
    attestations,
    idempotentReplay: false,
    truthBoundary: 'Issuer private keys remain inside the Edge Function isolate and are never returned.',
  };
  state.evidence.set(event.eventId, result);
  return result;
}

function normaliseClaims(claims: Record<string, unknown> = {}) {
  return Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [
    claim,
    typeof claims[claim] === 'boolean' ? claims[claim] : null,
  ])) as Record<RequiredClaim, boolean | null>;
}

function risk(event: any, claims: Record<RequiredClaim, boolean | null>) {
  let score = 0.18;
  if (Number(event.payload.amount) >= 10_000) score += 0.28;
  if (event.payload.newDevice === true) score += 0.22;
  if (event.payload.newRecipient === true) score += 0.13;
  if (claims.NO_ACTIVE_COMPROMISE === false) score += 0.30;
  if (claims.KYC_VALID === false) score += 0.25;
  return Math.min(0.99, Number(score.toFixed(2)));
}

function runPolicy(event: any, rawClaims: Record<string, unknown>) {
  validateEvent(event);
  const claims = normaliseClaims(rawClaims);
  const missingClaims = REQUIRED_CLAIMS.filter((claim) => claims[claim] === null);
  const failedCriticalClaims = (['KYC_VALID', 'NO_ACTIVE_COMPROMISE', 'BALANCE_GT_TRANSFER'] as RequiredClaim[])
    .filter((claim) => claims[claim] === false);
  const riskScore = risk(event, claims);

  let decision: 'APPROVE' | 'CHALLENGE' | 'REVIEW';
  let reasonCode: string;
  if (missingClaims.length) {
    decision = 'REVIEW';
    reasonCode = 'MISSING_CRITICAL_EVIDENCE';
  } else if (failedCriticalClaims.length) {
    decision = 'REVIEW';
    reasonCode = 'FAILED_CRITICAL_EVIDENCE';
  } else if (riskScore >= 0.55) {
    decision = 'CHALLENGE';
    reasonCode = 'ELEVATED_TRANSACTION_RISK';
  } else {
    decision = 'APPROVE';
    reasonCode = 'POLICY_REQUIREMENTS_SATISFIED';
  }

  return {
    policyVersion: POLICY_VERSION,
    decision,
    reasonCode,
    riskScore,
    claims,
    missingClaims,
    failedCriticalClaims,
  };
}

function rowToReceipt(row: DecisionRow, idempotentReplay = false) {
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionId: row.decision_id,
    inputHash: row.input_hash,
    eventId: row.event_id,
    transactionId: row.transaction_id,
    subjectId: row.subject_id,
    evaluatedAt: row.evaluated_at,
    policyVersion: row.policy_version,
    decision: row.decision,
    reasonCode: row.reason_code,
    riskScore: Number(row.risk_score),
    claims: row.claims,
    provenance: row.provenance,
    missingClaims: row.missing_claims,
    failedCriticalClaims: row.failed_critical_claims,
    rawFieldsDisclosed: row.raw_fields_disclosed,
    receiptHash: row.receipt_hash,
    decisionLatencyMs: Number(row.decision_latency_ms),
    idempotentReplay,
  };
}

async function findDecisionByInput(inputHash: string): Promise<DecisionRow | null> {
  const rows = await db(`/rest/v1/privaterisk_v07_decisions?input_hash=eq.${inputHash}&select=*`);
  return rows?.[0] ?? null;
}

async function findDecisionById(id: string): Promise<DecisionRow | null> {
  const rows = await db(`/rest/v1/privaterisk_v07_decisions?decision_id=eq.${encodeURIComponent(id)}&select=*`);
  return rows?.[0] ?? null;
}

async function recordOperation(
  operation_type: 'IDEMPOTENT_REPLAY' | 'EXPLICIT_REPLAY',
  decision_id: string,
  matches_original: boolean | null = null,
) {
  await db('/rest/v1/privaterisk_v07_operations', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ operation_type, decision_id, matches_original }),
  });
}

async function evaluateDecision(request: any) {
  const started = performance.now();
  const event = validateEvent(request.event);
  const claims = normaliseClaims(request.claims ?? {});
  const provenance = Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, request.provenance?.[claim] ?? null]));
  const input = { event, claims, provenance };
  const inputHash = await sha256Hex(input);
  const decisionId = `decision_${inputHash.slice(0, 24)}`;

  const existing = await findDecisionByInput(inputHash);
  if (existing) {
    await recordOperation('IDEMPOTENT_REPLAY', existing.decision_id);
    return rowToReceipt(existing, true);
  }

  const result = runPolicy(event, claims);
  const evaluatedAt = new Date().toISOString();
  const core = {
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionId,
    inputHash,
    eventId: event.eventId,
    transactionId: event.payload.transactionId,
    subjectId: event.payload.subjectId,
    evaluatedAt,
    policyVersion: result.policyVersion,
    decision: result.decision,
    reasonCode: result.reasonCode,
    riskScore: result.riskScore,
    claims: result.claims,
    provenance,
    missingClaims: result.missingClaims,
    failedCriticalClaims: result.failedCriticalClaims,
    rawFieldsDisclosed: 0,
  };
  const receiptHash = await sha256Hex(core);
  const decisionLatencyMs = Number((performance.now() - started).toFixed(2));
  const row = {
    decision_id: decisionId,
    input_hash: inputHash,
    event_id: event.eventId,
    transaction_id: event.payload.transactionId,
    subject_id: event.payload.subjectId,
    evaluated_at: evaluatedAt,
    policy_version: result.policyVersion,
    decision: result.decision,
    reason_code: result.reasonCode,
    risk_score: result.riskScore,
    claims: result.claims,
    provenance,
    missing_claims: result.missingClaims,
    failed_critical_claims: result.failedCriticalClaims,
    raw_fields_disclosed: 0,
    receipt_hash: receiptHash,
    decision_latency_ms: decisionLatencyMs,
    request: input,
  };

  try {
    const inserted = await db('/rest/v1/privaterisk_v07_decisions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    return rowToReceipt(inserted[0], false);
  } catch (error) {
    const raced = await findDecisionByInput(inputHash);
    if (!raced) throw error;
    await recordOperation('IDEMPOTENT_REPLAY', raced.decision_id);
    return rowToReceipt(raced, true);
  }
}

async function replayDecision(id: string) {
  const row = await findDecisionById(id);
  if (!row) return null;
  const result = runPolicy(row.request.event, row.request.claims);
  const original = {
    policyVersion: row.policy_version,
    decision: row.decision,
    reasonCode: row.reason_code,
    riskScore: Number(row.risk_score),
    claims: row.claims,
    missingClaims: row.missing_claims,
    failedCriticalClaims: row.failed_critical_claims,
  };
  const replay = {
    policyVersion: result.policyVersion,
    decision: result.decision,
    reasonCode: result.reasonCode,
    riskScore: result.riskScore,
    claims: result.claims,
    missingClaims: result.missingClaims,
    failedCriticalClaims: result.failedCriticalClaims,
  };
  const matchesOriginal = stableStringify(original) === stableStringify(replay);
  await recordOperation('EXPLICIT_REPLAY', id, matchesOriginal);
  return {
    decisionId: id,
    replayedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    matchesOriginal,
    original,
    replay,
  };
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1))];
}

async function metrics() {
  const decisions = await db('/rest/v1/privaterisk_v07_decisions?select=decision,reason_code,decision_latency_ms,missing_claims,failed_critical_claims');
  const operations = await db('/rest/v1/privaterisk_v07_operations?select=operation_type,matches_original');
  const byDecision = { APPROVE: 0, CHALLENGE: 0, REVIEW: 0 };
  const byReason: Record<string, number> = {};
  let missingEvidence = 0;
  let failedCriticalEvidence = 0;
  const latencies: number[] = [];

  for (const decision of decisions) {
    byDecision[decision.decision as keyof typeof byDecision] += 1;
    byReason[decision.reason_code] = (byReason[decision.reason_code] ?? 0) + 1;
    missingEvidence += (decision.missing_claims ?? []).length;
    failedCriticalEvidence += (decision.failed_critical_claims ?? []).length;
    latencies.push(Number(decision.decision_latency_ms));
  }

  const total = decisions.length;
  const idempotentReplays = operations.filter((op: any) => op.operation_type === 'IDEMPOTENT_REPLAY').length;
  const explicitReplays = operations.filter((op: any) => op.operation_type === 'EXPLICIT_REPLAY');
  const replayMismatches = explicitReplays.filter((op: any) => op.matches_original === false).length;

  return {
    policyVersion: POLICY_VERSION,
    decisionsTotal: total,
    byDecision,
    byReason,
    approveRate: total ? Number((byDecision.APPROVE / total).toFixed(4)) : 0,
    challengeRate: total ? Number((byDecision.CHALLENGE / total).toFixed(4)) : 0,
    reviewRate: total ? Number((byDecision.REVIEW / total).toFixed(4)) : 0,
    missingEvidence,
    failedCriticalEvidence,
    idempotentReplays,
    explicitReplays: explicitReplays.length,
    replayMismatches,
    latencyMs: {
      samples: latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
    },
    storage: 'postgres',
    truthBoundary: 'Challenge/review rates are operational decision metrics, not fraud precision, recall, or false-positive rate because no production ground-truth labels are present.',
  };
}

async function verifyAudit() {
  const rows = await db('/rest/v1/rpc/privaterisk_v07_verify_audit', { method: 'POST', body: '{}' });
  const row = rows[0] ?? { valid: true, count: 0, head_hash: null, broken_at: null };
  return {
    valid: row.valid,
    count: Number(row.count),
    headHash: row.head_hash,
    brokenAt: row.broken_at === null ? null : Number(row.broken_at),
  };
}

async function appendAudit(idempotencyKey: string, record: any) {
  const rows = await db('/rest/v1/rpc/privaterisk_v07_append_audit', {
    method: 'POST',
    body: JSON.stringify({ p_idempotency_key: idempotencyKey, p_record: record }),
  });
  const row = rows[0];
  const integrity = await verifyAudit();
  return {
    entry: {
      index: Number(row.audit_index),
      previousHash: row.previous_hash,
      receivedAt: row.received_at,
      idempotencyKey: row.idempotency_key,
      record: row.record,
      hash: row.hash,
    },
    count: integrity.count,
    idempotentReplay: row.idempotent_replay,
    integrity,
    storage: 'postgres',
  };
}

async function createAuditedDecision(request: any) {
  const receipt = await evaluateDecision(request);
  const audit = await appendAudit(`decision:${receipt.decisionId}`, {
    auditId: `audit_${receipt.receiptHash.slice(0, 24)}`,
    eventId: receipt.eventId,
    transactionId: receipt.transactionId,
    correlationId: receipt.decisionId,
    createdAt: receipt.evaluatedAt,
    policyVersion: receipt.policyVersion,
    decision: receipt.decision,
    reasonCode: receipt.reasonCode,
    riskScore: receipt.riskScore,
    rawFieldsDisclosed: 0,
    receiptHash: receipt.receiptHash,
    evidence: Object.entries(receipt.provenance).map(([claim, source]) => ({ claim, source })),
  });
  return {
    receipt,
    audit: {
      hash: audit.entry.hash,
      previousHash: audit.entry.previousHash,
      index: audit.entry.index,
      count: audit.count,
      integrity: audit.integrity,
      idempotentReplay: audit.idempotentReplay,
      storage: 'postgres',
    },
  };
}

async function probe(url: string, init: RequestInit) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    return { reachable: response.ok, status: response.status, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function preprodHealth() {
  const [node, indexer] = await Promise.all([
    probe(PREPROD.node, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system_health', params: [] }),
    }),
    probe(PREPROD.indexer, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'query PrivateRiskProbe { __typename }' }),
    }),
  ]);
  return {
    target: 'Midnight Preprod',
    checkedAt: new Date().toISOString(),
    node: { endpoint: PREPROD.node, ...node },
    indexer: { endpoint: PREPROD.indexer, ...indexer },
    writeState: 'NOT_CONFIGURED',
    contractAddress: null,
    transactionId: null,
    note: 'Public service performs read-only connectivity only. Chain-write truth comes from the dedicated deployment evidence gate.',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const marker = '/privaterisk-v06';
  const index = url.pathname.indexOf(marker);
  const path = index >= 0 ? (url.pathname.slice(index + marker.length) || '/') : url.pathname;

  try {
    const issuers = await issuerState;

    if (req.method === 'GET' && (path === '/' || path === '/health')) {
      return json({
        service: 'privaterisk-v06',
        version: '0.7.0',
        policyVersion: POLICY_VERSION,
        mode: 'public-supabase-edge',
        storage: 'postgres',
        startedAt: issuers.startedAt,
        truthBoundary: 'Stable public endpoint upgraded with V0.7 durable decision/idempotency/audit state in Postgres. Issuer signing keys remain Edge-isolate scoped; no HSM/KMS claim is made.',
      });
    }
    if (req.method === 'GET' && path === '/v1/registry') {
      return json({ registry: registry(issuers.issuers) });
    }
    if (req.method === 'POST' && path === '/v1/attestations') {
      const body = await req.json();
      return json(await issue(body.event));
    }
    if (req.method === 'POST' && path === '/v1/decisions') {
      return json(await createAuditedDecision(await req.json()));
    }
    if (req.method === 'GET' && path === '/v1/metrics') {
      return json(await metrics());
    }

    const replayMatch = path.match(/^\/v1\/decisions\/([^/]+)\/replay$/);
    if (req.method === 'POST' && replayMatch) {
      const result = await replayDecision(decodeURIComponent(replayMatch[1]));
      return result ? json(result) : json({ error: 'DECISION_NOT_FOUND' }, 404);
    }

    const decisionMatch = path.match(/^\/v1\/decisions\/([^/]+)$/);
    if (req.method === 'GET' && decisionMatch) {
      const row = await findDecisionById(decodeURIComponent(decisionMatch[1]));
      return row ? json({ receipt: rowToReceipt(row, false) }) : json({ error: 'DECISION_NOT_FOUND' }, 404);
    }

    if (req.method === 'POST' && path === '/v1/audit') {
      const body = await req.json();
      const key = req.headers.get('idempotency-key') ?? body.idempotencyKey;
      return json(await appendAudit(key, body.record));
    }
    if (req.method === 'GET' && path === '/v1/audit') {
      const eventId = url.searchParams.get('eventId');
      const suffix = eventId
        ? `?record->>eventId=eq.${encodeURIComponent(eventId)}&select=*&order=audit_index.asc`
        : '?select=*&order=audit_index.asc';
      const entries = await db(`/rest/v1/privaterisk_v07_audit${suffix}`);
      return json({ entries, storage: 'postgres' });
    }
    if (req.method === 'GET' && path === '/v1/audit/verify') {
      return json(await verifyAudit());
    }
    if (req.method === 'GET' && path === '/v1/network/preprod-health') {
      return json(await preprodHealth());
    }

    return json({ error: 'NOT_FOUND', path }, 404);
  } catch (error) {
    return json({
      error: 'REQUEST_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }, 400);
  }
});
