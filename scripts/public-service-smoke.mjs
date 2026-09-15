const base = process.env.PRIVATERISK_PUBLIC_API ?? 'https://htffcvdopavknnylbowl.supabase.co/functions/v1/privaterisk-v06';

function bodyBytes(body) {
  return new TextEncoder().encode(JSON.stringify([
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

async function json(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${JSON.stringify(body)}`);
  return body;
}

const health = await json(`${base}/health`);
if (health.service !== 'privaterisk-v06' || health.mode !== 'public-supabase-edge') {
  throw new Error(`Unexpected public-service health: ${JSON.stringify(health)}`);
}

const eventId = `evt_public_${crypto.randomUUID()}`;
const subjectId = `subject_${crypto.randomUUID()}`;
const event = {
  topic: 'payments.transaction.created',
  schemaVersion: '1.0',
  eventId,
  key: subjectId,
  occurredAt: new Date().toISOString(),
  payload: {
    transactionId: `tx_${crypto.randomUUID()}`,
    subjectId,
    amount: 15000,
    currency: 'EUR',
    newDevice: true,
    newRecipient: true,
  },
};

const evidence = await json(`${base}/v1/attestations`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event }),
});
if (evidence.attestations?.length !== 3 || evidence.registry?.length !== 3) {
  throw new Error(`Expected 3 signed attestations + 3 registry entries: ${JSON.stringify(evidence)}`);
}
if (JSON.stringify(evidence).includes('privateKey')) {
  throw new Error('Public API leaked a private-key field.');
}

for (const attestation of evidence.attestations) {
  const registry = evidence.registry.find((entry) => entry.issuer === attestation.body.issuer && entry.keyId === attestation.body.keyId);
  if (!registry) throw new Error(`Missing registry entry for ${attestation.body.issuer}`);
  if (!registry.allowedClaims.includes(attestation.body.claim)) throw new Error(`Issuer is not authorised for ${attestation.body.claim}`);
  if (attestation.body.eventId !== eventId || attestation.body.subjectId !== subjectId) throw new Error('Attestation binding mismatch.');
  const key = await crypto.subtle.importKey('jwk', registry.publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  const signature = Buffer.from(attestation.signature, 'base64url');
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, bodyBytes(attestation.body));
  if (!valid) throw new Error(`Signature verification failed for ${attestation.body.claim}`);
}

const record = {
  auditId: `audit_${crypto.randomUUID()}`,
  eventId,
  transactionId: event.payload.transactionId,
  correlationId: eventId.slice(0, 16),
  createdAt: new Date().toISOString(),
  policyVersion: 'fraud-policy-v0.6',
  decision: 'CHALLENGE',
  riskScore: 0.71,
  networkState: 'PREPROD_NOT_CONFIGURED',
  rawFieldsDisclosed: 0,
  evidence: evidence.attestations.map((a) => ({ claim: a.body.claim, source: 'signed-attestation', issuer: a.body.issuer })),
};
const audit = await json(`${base}/v1/audit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `decision:${eventId}:fraud-policy-v0.6` },
  body: JSON.stringify({ record }),
});
if (!audit.integrity?.valid) throw new Error(`Public audit chain did not verify: ${JSON.stringify(audit)}`);

const probe = await json(`${base}/v1/network/preprod-health`);
if (probe.target !== 'Midnight Preprod' || probe.writeState !== 'NOT_CONFIGURED') {
  throw new Error(`Unexpected network truth state: ${JSON.stringify(probe)}`);
}

console.log(JSON.stringify({
  status: 'PASS',
  base,
  signedAttestations: evidence.attestations.length,
  auditChainVerified: audit.integrity.valid,
  preprodNodeReachable: probe.node?.reachable,
  preprodIndexerReachable: probe.indexer?.reachable,
  writeState: probe.writeState,
}, null, 2));
