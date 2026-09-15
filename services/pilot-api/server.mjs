import http from 'node:http';
import { createPilotServiceState, issueForEvent, appendAudit, listAudit, publicRegistry, verifyAuditChain } from './core.mjs';

const PORT = Number(process.env.PORT ?? '8787');
const HOST = process.env.HOST ?? '127.0.0.1';
const state = createPilotServiceState();

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
    return {
      reachable: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      responseType: body ? 'json' : 'non-json',
    };
  } catch (error) {
    return {
      reachable: false,
      status: null,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function preprodProbe() {
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
    note: 'Read-only connectivity only. No wallet signer is configured and no chain submission is claimed.',
  };
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        service: 'privaterisk-pilot-api',
        version: '0.5.0',
        mode: 'external-http',
        startedAt: state.startedAt,
        uptimeSeconds: Math.round(process.uptime()),
      });
    }

    if (req.method === 'GET' && url.pathname === '/v1/registry') {
      return json(res, 200, { registry: publicRegistry(state) });
    }

    if (req.method === 'POST' && url.pathname === '/v1/attestations') {
      const { event } = await readJson(req);
      return json(res, 200, issueForEvent(state, event));
    }

    if (req.method === 'POST' && url.pathname === '/v1/audit') {
      const body = await readJson(req);
      const idempotencyKey = req.headers['idempotency-key'] || body.idempotencyKey;
      return json(res, 200, await appendAudit(state, { idempotencyKey, record: body.record }));
    }

    if (req.method === 'GET' && url.pathname === '/v1/audit') {
      return json(res, 200, { entries: listAudit(state, url.searchParams.get('eventId') ?? undefined) });
    }

    if (req.method === 'GET' && url.pathname === '/v1/audit/verify') {
      return json(res, 200, await verifyAuditChain(state.auditEntries));
    }

    if (req.method === 'GET' && url.pathname === '/v1/network/preprod-health') {
      return json(res, 200, await preprodProbe());
    }

    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return json(res, 400, {
      error: 'REQUEST_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PrivateRisk pilot API listening on http://${HOST}:${PORT}`);
});
