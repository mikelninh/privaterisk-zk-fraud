import http from 'node:http';
import {
  createPilotServiceState,
  issueForEvent,
  appendAudit,
  listAudit,
  publicRegistry,
  verifyAuditChain,
} from './core.mjs';
import {
  POLICY_VERSION,
  controlMetrics,
  evaluateDecision,
  getDecision,
  initialiseControlPlane,
  replayDecision,
} from './control-plane.mjs';

const PORT = Number(process.env.PORT ?? '8787');
const HOST = process.env.HOST ?? '127.0.0.1';
const state = initialiseControlPlane(createPilotServiceState());

const PREPROD = {
  node: 'https://rpc.preprod.midnight.network',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,idempotency-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
function json(res, status, body) {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function probe(url, init) {
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { reachable: response.ok, status: response.status, latencyMs: Date.now() - started, responseType: body ? 'json' : 'non-json' };
  } catch (error) {
    return { reachable: false, status: null, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}
async function preprodProbe() {
  const [node, indexer] = await Promise.all([
    probe(PREPROD.node, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'system_health', params: [] }) }),
    probe(PREPROD.indexer, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'query PrivateRiskProbe { __typename }' }) }),
  ]);
  return {
    target: 'Midnight Preprod', checkedAt: new Date().toISOString(),
    node: { endpoint: PREPROD.node, ...node }, indexer: { endpoint: PREPROD.indexer, ...indexer },
    writeState: 'EXTERNAL_DEPLOYMENT_GATE', contractAddress: null, transactionId: null,
    note: 'This service performs read-only health checks. Chain write truth comes only from the dedicated deployment evidence artifact.',
  };
}
async function createAuditedDecision(body) {
  const receipt = evaluateDecision(state, body);
  const audit = await appendAudit(state, {
    idempotencyKey: `decision:${receipt.decisionId}`,
    record: {
      auditId: `audit_${receipt.receiptHash.slice(0, 24)}`,
      eventId: receipt.eventId,
      transactionId: receipt.transactionId,
      correlationId: receipt.decisionId,
      createdAt: receipt.evaluatedAt,
      policyVersion: receipt.policyVersion,
      decision: receipt.decision,
      reasonCode: receipt.reasonCode,
      riskScore: receipt.riskScore,
      rawFieldsDisclosed: receipt.rawFieldsDisclosed,
      receiptHash: receipt.receiptHash,
      evidence: Object.entries(receipt.provenance).map(([claim, provenance]) => ({ claim, provenance })),
    },
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
    },
  };
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { service: 'privaterisk-pilot-api', version: '0.7.0', policyVersion: POLICY_VERSION, mode: 'operational-control-plane', startedAt: state.startedAt, uptimeSeconds: Math.round(process.uptime()) });
    if (req.method === 'GET' && url.pathname === '/v1/registry') return json(res, 200, { registry: publicRegistry(state) });
    if (req.method === 'POST' && url.pathname === '/v1/attestations') { const { event } = await readJson(req); return json(res, 200, issueForEvent(state, event)); }
    if (req.method === 'POST' && url.pathname === '/v1/decisions') return json(res, 200, await createAuditedDecision(await readJson(req)));
    if (req.method === 'GET' && url.pathname === '/v1/metrics') return json(res, 200, controlMetrics(state));

    const decisionMatch = url.pathname.match(/^\/v1\/decisions\/([^/]+)$/);
    if (req.method === 'GET' && decisionMatch) {
      const receipt = getDecision(state, decodeURIComponent(decisionMatch[1]));
      return receipt ? json(res, 200, { receipt }) : json(res, 404, { error: 'DECISION_NOT_FOUND' });
    }
    const replayMatch = url.pathname.match(/^\/v1\/decisions\/([^/]+)\/replay$/);
    if (req.method === 'POST' && replayMatch) {
      const replay = replayDecision(state, decodeURIComponent(replayMatch[1]));
      return replay ? json(res, 200, replay) : json(res, 404, { error: 'DECISION_NOT_FOUND' });
    }
    if (req.method === 'POST' && url.pathname === '/v1/audit') {
      const body = await readJson(req);
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey;
      return json(res, 200, await appendAudit(state, { idempotencyKey, record: body.record }));
    }
    if (req.method === 'GET' && url.pathname === '/v1/audit') return json(res, 200, { entries: listAudit(state, url.searchParams.get('eventId') ?? undefined) });
    if (req.method === 'GET' && url.pathname === '/v1/audit/verify') return json(res, 200, await verifyAuditChain(state.auditEntries));
    if (req.method === 'GET' && url.pathname === '/v1/network/preprod-health') return json(res, 200, await preprodProbe());
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return json(res, 400, { error: 'REQUEST_FAILED', message: error instanceof Error ? error.message : String(error) });
  }
});
server.listen(PORT, HOST, () => console.log(`PrivateRisk V0.7 control plane listening on http://${HOST}:${PORT}`));
