import * as compactRuntime from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../contracts/midnight/managed/privaterisk/contract/index.js';
import {
  PROOF_TTL_MS,
  assertFresh,
  classifyProofError,
  runWithProofRetry,
  type ProofFailureCode,
} from './proofRuntime';

const CIRCUIT = 'proveBalanceForTransfer';
const POLICY_VERSION = 'fraud-policy-v0.3';
const SYNTHETIC_PRIVATE_BALANCE = 27_000n;
const SAMPLE_COIN_PUBLIC_KEY = '00'.repeat(32);

export type LiveProofReceipt = {
  accepted: true;
  circuit: string;
  mode: 'browser-wasm';
  networkSubmission: 'not-submitted';
  requestId: string;
  correlationId: string;
  policyVersion: string;
  policyDigest: string;
  transferAmount: number;
  expiresAt: string;
  proofSha256: string;
  proofBytes: number;
  attempts: number;
  wasmLoadMs: number;
  checkMs: number;
  proveMs: number;
  totalMs: number;
};

export type LiveProofFailure = {
  accepted: false;
  code: ProofFailureCode;
  message: string;
};

type WorkerResult = {
  proof: Uint8Array;
  outputs: Array<string | null>;
  wasmLoadMs: number;
  checkMs: number;
  proveMs: number;
  totalMs: number;
};

type Pending = {
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextWorkerRequest = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('./proofWorker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message.ready) return;

    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);

    if (message.error) request.reject(new Error(message.error));
    else request.resolve(message.ok as WorkerResult);
  };

  worker.onerror = (event) => {
    const error = new Error(`proof worker crashed: ${event.message}`);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    worker?.terminate();
    worker = null;
  };

  return worker;
}

function callWorker(preimage: Uint8Array): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const id = nextWorkerRequest++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ id, preimage: new Uint8Array(preimage) });
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Bytes(value: string | Uint8Array): Promise<Uint8Array> {
  const source = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  // Force an ArrayBuffer-backed copy for WebCrypto's strict BufferSource type.
  const input = new Uint8Array(source.byteLength);
  input.set(source);
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input.buffer));
}

async function sha256Hex(value: Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(value));
}

function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

const browserWitnesses = {
  privateBalance: ({ privateState }: { privateState: { balance: bigint } }) => [
    privateState,
    privateState.balance,
  ] as [{ balance: bigint }, bigint],
};

const contract = new Contract<{ balance: bigint }>(browserWitnesses);
const constructorContext = compactRuntime.createConstructorContext(
  { balance: SYNTHETIC_PRIVATE_BALANCE },
  SAMPLE_COIN_PUBLIC_KEY,
);
const initial = contract.initialState(constructorContext);

let sessionContext = compactRuntime.createCircuitContext(
  compactRuntime.sampleContractAddress(),
  initial.currentZswapLocalState,
  initial.currentContractState,
  initial.currentPrivateState,
);

export async function generateLiveBalanceProof(transferAmount: number): Promise<LiveProofReceipt | LiveProofFailure> {
  const requestIdBytes = randomBytes32();
  const policyVersionBytes = await sha256Bytes(POLICY_VERSION);
  const expiresAtMs = Date.now() + PROOF_TTL_MS;

  try {
    const circuitResult = contract.circuits.proveBalanceForTransfer(
      sessionContext,
      requestIdBytes,
      BigInt(transferAmount),
      policyVersionBytes,
      BigInt(expiresAtMs),
    );

    const { proofData } = circuitResult;
    const serializedPreimage = compactRuntime.proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      CIRCUIT,
    );

    const { value: workerResult, attempts } = await runWithProofRetry(
      () => callWorker(serializedPreimage),
      { attempts: 2, timeoutMs: 25_000 },
    );

    // The public context includes an expiry. The contract binds it; the product
    // runtime owns the wall-clock check before consuming the proof result.
    assertFresh(expiresAtMs);

    // Only commit replay state after the proof has actually been generated.
    sessionContext = circuitResult.context;

    const requestId = bytesToHex(requestIdBytes);
    const policyDigest = bytesToHex(policyVersionBytes);

    return {
      accepted: true,
      circuit: CIRCUIT,
      mode: 'browser-wasm',
      networkSubmission: 'not-submitted',
      requestId,
      correlationId: requestId.slice(0, 12),
      policyVersion: POLICY_VERSION,
      policyDigest: policyDigest.slice(0, 16),
      transferAmount,
      expiresAt: new Date(expiresAtMs).toISOString(),
      proofSha256: await sha256Hex(workerResult.proof),
      proofBytes: workerResult.proof.byteLength,
      attempts,
      wasmLoadMs: workerResult.wasmLoadMs,
      checkMs: workerResult.checkMs,
      proveMs: workerResult.proveMs,
      totalMs: workerResult.totalMs,
    };
  } catch (error) {
    const classified = classifyProofError(error);
    return {
      accepted: false,
      code: classified.code,
      message: classified.message,
    };
  }
}
