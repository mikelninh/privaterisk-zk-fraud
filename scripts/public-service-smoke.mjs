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
if (health.version !== '0.7.0' || health.policyVersion !== 'privaterisk-policy-v0.7') {
  throw new Error(`V0.7 control plane is not active: ${JSON.stringify(health)}`);
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

const claims = Object.fromEntries(evidence.attestations.map((a) => [a.body.claim, a.body.value]));
claims.BALANCE_GT_TRANSFER = true;
const provenance = Object.fromEntries(evidence.attestations.map((a) => [a.body.claim, `signed-attestation:${a.body.issuer}`]));
provenance.BALANCE_GT_TRANSFER = 'midnight-proof:compact-plonk';

const firstDecision = await json(`${base}/v1/decisions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event, claims, provenance }),
});
if (firstDecision.receipt?.decision !== 'CHALLENGE' || firstDecision.receipt?.reasonCode !== 'ELEVATED_TRANSACTION_RISK') {
  throw new Error(`Canonical V0.7 decision should CHALLENGE: ${JSON.stringify(firstDecision)}`);
}
if (firstDecision.receipt.rawFieldsDisclosed !== 0 || !firstDecision.audit?.integrity?.valid) {
  throw new Error(`Decision receipt/audit truth failed: ${JSON.stringify(firstDecision)}`);
}

const idempotent = await json(`${base}/v1/decisions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event, claims, provenance }),
});
if (!idempotent.receipt?.idempotentReplay || idempotent.receipt.decisionId !== firstDecision.receipt.decisionId) {
  throw new Error(`Decision idempotency failed: ${JSON.stringify(idempotent)}`);
}

const fetched = await json(`${base}/v1/decisions/${encodeURIComponent(firstDecision.receipt.decisionId)}`);
if (fetched.receipt?.receiptHash !== firstDecision.receipt.receiptHash) {
  throw new Error(`Decision receipt lookup mismatch: ${JSON.stringify(fetched)}`);
}

const replay = await json(`${base}/v1/decisions/${encodeURIComponent(firstDecision.receipt.decisionId)}/replay`, { method: 'POST' });
if (!replay.matchesOriginal || replay.replay?.decision !== firstDecision.receipt.decision) {
  throw new Error(`Deterministic replay failed: ${JSON.stringify(replay)}`);
}

const missingEvidenceEvent = {
  ...event,
  eventId: `evt_missing_${crypto.randomUUID()}`,
  payload: { ...event.payload, transactionId: `tx_missing_${crypto.randomUUID()}` },
};
const missingClaims = { ...claims };
delete missingClaims.BALANCE_GT_TRANSFER;
const failClosed = await json(`${base}/v1/decisions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event: missingEvidenceEvent, claims: missingClaims, provenance }),
});
if (failClosed.receipt?.decision !== 'REVIEW' || failClosed.receipt?.reasonCode !== 'MISSING_CRITICAL_EVIDENCE') {
  throw new Error(`Missing evidence must fail closed to REVIEW: ${JSON.stringify(failClosed)}`);
}

const metrics = await json(`${base}/v1/metrics`);
if (metrics.policyVersion !== 'privaterisk-policy-v0.7' || metrics.decisionsTotal < 2) {
  throw new Error(`Operational metrics missing: ${JSON.stringify(metrics)}`);
}
if (metrics.byDecision?.CHALLENGE < 1 || metrics.byDecision?.REVIEW < 1 || metrics.replayMismatches !== 0) {
  throw new Error(`Operational metrics are inconsistent: ${JSON.stringify(metrics)}`);
}
if (!String(metrics.truthBoundary).includes('not fraud precision')) {
  throw new Error('Metrics truth boundary is missing.');
}

// Legacy explicit audit API remains backwards compatible.
const record = {
  auditId: `audit_${crypto.randomUUID()}`,
  eventId,
  transactionId: event.payload.transactionId,
  correlationId: eventId.slice(0, 16),
  createdAt: new Date().toISOString(),
  policyVersion: 'privaterisk-policy-v0.7',
  decision: 'CHALLENGE',
  riskScore: firstDecision.receipt.riskScore,
  networkState: 'PREPROD_EXTERNAL_GATE',
  rawFieldsDisclosed: 0,
  evidence: evidence.attestations.map((a) => ({ claim: a.body.claim, source: 'signed-attestation', issuer: a.body.issuer })),
};
const audit = await json(`${base}/v1/audit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `legacy:${eventId}:privaterisk-policy-v0.7` },
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
  serviceVersion: health.version,
  policyVersion: health.policyVersion,
  signedAttestations: evidence.attestations.length,
  canonicalDecision: firstDecision.receipt.decision,
  decisionReceiptHash: firstDecision.receipt.receiptHash,
  replayMatchesOriginal: replay.matchesOriginal,
  failClosedDecision: failClosed.receipt.decision,
  decisionsObserved: metrics.decisionsTotal,
  auditChainVerified: audit.integrity.valid,
  preprodNodeReachable: probe.node?.reachable,
  preprodIndexerReachable: probe.indexer?.reachable,
  writeState: probe.writeState,
}, null, 2));
