import { createHash, generateKeyPairSync, sign as nodeSign } from 'node:crypto';

export const ATTESTATION_VERSION = 'privaterisk-attestation-v1';
export const ATTESTED_CLAIMS = ['KYC_VALID', 'ACCOUNT_AGE_GT_365', 'NO_ACTIVE_COMPROMISE'];

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stable(value));
}

export function sha256Hex(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function encodeAttestationBody(body) {
  return Buffer.from(JSON.stringify([
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

function base64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function createIssuer(issuer, displayName, allowedClaims) {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyId = `${issuer}#service-es256-v1`;
  return {
    issuer,
    keyId,
    displayName,
    allowedClaims,
    privateKey,
    publicJwk: publicKey.export({ format: 'jwk' }),
  };
}

function signAttestation(body, issuer) {
  const signature = nodeSign('sha256', encodeAttestationBody(body), {
    key: issuer.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return { alg: 'ES256', body, signature: base64Url(signature) };
}

export function validateEvent(event) {
  if (!event || event.topic !== 'payments.transaction.created') throw new Error('Unsupported event topic.');
  if (event.schemaVersion !== '1.0') throw new Error('Unsupported event schema version.');
  if (!event.eventId || !event.key || !event.payload?.subjectId || !event.payload?.transactionId) {
    throw new Error('Event envelope is missing required identifiers.');
  }
  if (event.key !== event.payload.subjectId) throw new Error('Event key must equal subject id.');
  return event;
}

export function createPilotServiceState() {
  const identity = createIssuer('did:privaterisk:identity-service', 'Identity Service', ['KYC_VALID']);
  const bank = createIssuer('did:privaterisk:bank-service', 'Bank Core Service', ['ACCOUNT_AGE_GT_365']);
  const fraud = createIssuer('did:privaterisk:fraud-service', 'Fraud Intelligence Service', ['NO_ACTIVE_COMPROMISE']);
  const issuers = [identity, bank, fraud];

  return {
    startedAt: new Date().toISOString(),
    issuers,
    evidenceByEvent: new Map(),
    auditByIdempotencyKey: new Map(),
    auditEntries: [],
  };
}

export function publicRegistry(state) {
  return state.issuers.map(({ issuer, keyId, displayName, allowedClaims, publicJwk }) => ({
    issuer,
    keyId,
    displayName,
    allowedClaims,
    publicJwk,
  }));
}

export function issueForEvent(state, rawEvent, now = new Date()) {
  const event = validateEvent(rawEvent);
  const cached = state.evidenceByEvent.get(event.eventId);
  if (cached) return { ...cached, idempotentReplay: true };

  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  const byClaim = Object.fromEntries(state.issuers.flatMap((issuer) => issuer.allowedClaims.map((claim) => [claim, issuer])));

  const claims = {
    KYC_VALID: true,
    ACCOUNT_AGE_GT_365: true,
    NO_ACTIVE_COMPROMISE: true,
  };

  const attestations = ATTESTED_CLAIMS.map((claim) => {
    const issuer = byClaim[claim];
    const body = {
      version: ATTESTATION_VERSION,
      issuer: issuer.issuer,
      keyId: issuer.keyId,
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
      claim,
      value: claims[claim],
      issuedAt: now.toISOString(),
      expiresAt,
      nonce: crypto.randomUUID(),
    };
    return signAttestation(body, issuer);
  });

  const response = {
    service: 'privaterisk-pilot-api',
    mode: 'external-http',
    eventId: event.eventId,
    registry: publicRegistry(state),
    attestations,
    idempotentReplay: false,
  };
  state.evidenceByEvent.set(event.eventId, response);
  return response;
}

export async function appendAudit(state, { idempotencyKey, record }) {
  if (!idempotencyKey || !record?.eventId || !record?.auditId) throw new Error('Audit append requires idempotencyKey and record identifiers.');
  const existing = state.auditByIdempotencyKey.get(idempotencyKey);
  if (existing) return { entry: existing, count: state.auditEntries.length, idempotentReplay: true, integrity: await verifyAuditChain(state.auditEntries) };

  const previousHash = state.auditEntries.at(-1)?.hash ?? 'GENESIS';
  const core = {
    index: state.auditEntries.length,
    previousHash,
    receivedAt: new Date().toISOString(),
    idempotencyKey,
    record,
  };
  const entry = { ...core, hash: sha256Hex(core) };
  state.auditEntries.push(entry);
  state.auditByIdempotencyKey.set(idempotencyKey, entry);
  return { entry, count: state.auditEntries.length, idempotentReplay: false, integrity: await verifyAuditChain(state.auditEntries) };
}

export async function verifyAuditChain(entries) {
  let previousHash = 'GENESIS';
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.index !== index || entry.previousHash !== previousHash) {
      return { valid: false, count: entries.length, headHash: entries.at(-1)?.hash ?? null, brokenAt: index };
    }
    const core = {
      index: entry.index,
      previousHash: entry.previousHash,
      receivedAt: entry.receivedAt,
      idempotencyKey: entry.idempotencyKey,
      record: entry.record,
    };
    if (sha256Hex(core) !== entry.hash) {
      return { valid: false, count: entries.length, headHash: entries.at(-1)?.hash ?? null, brokenAt: index };
    }
    previousHash = entry.hash;
  }
  return { valid: true, count: entries.length, headHash: entries.at(-1)?.hash ?? null, brokenAt: null };
}

export function listAudit(state, eventId) {
  const entries = eventId ? state.auditEntries.filter((entry) => entry.record.eventId === eventId) : state.auditEntries;
  return entries.map((entry) => structuredClone(entry));
}
