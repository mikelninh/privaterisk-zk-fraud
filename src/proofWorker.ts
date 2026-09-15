/// <reference lib="webworker" />

const ctx = self as DedicatedWorkerGlobalScope;
const cache = new Map<string, Uint8Array>();

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}zk/${path}`;
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  if (cache.has(path)) return cache.get(path)!;

  const response = await fetch(assetUrl(path), { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`fetch failed for Midnight proving asset ${path}: HTTP ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  cache.set(path, bytes);
  return bytes;
}

const keyProvider = {
  async lookupKey(keyLocation: string) {
    const [proverKey, verifierKey, ir] = await Promise.all([
      fetchBytes(`keys/${keyLocation}.prover`),
      fetchBytes(`keys/${keyLocation}.verifier`),
      fetchBytes(`zkir/${keyLocation}.bzkir`),
    ]);

    return { proverKey, verifierKey, ir };
  },
  async getParams(k: number) {
    return fetchBytes(`params/params_${k}.bin`);
  },
};

ctx.onmessage = async (event: MessageEvent<{ id: number; preimage: Uint8Array }>) => {
  const { id, preimage } = event.data;
  const startedAt = performance.now();

  try {
    const zkir = await import('@midnight-ntwrk/zkir-v2');
    const checkedAt = performance.now();
    const outputs = await zkir.check(preimage, keyProvider);
    const checkCompletedAt = performance.now();
    const proof = await zkir.prove(preimage, keyProvider);
    const proofCompletedAt = performance.now();

    ctx.postMessage({
      id,
      ok: {
        proof: new Uint8Array(proof),
        outputs: outputs.map((value) => value?.toString() ?? null),
        wasmLoadMs: Math.round(checkedAt - startedAt),
        checkMs: Math.round(checkCompletedAt - checkedAt),
        proveMs: Math.round(proofCompletedAt - checkCompletedAt),
        totalMs: Math.round(proofCompletedAt - startedAt),
      },
    });
  } catch (error) {
    ctx.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

ctx.postMessage({ ready: true });
