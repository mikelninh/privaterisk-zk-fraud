export const PROOF_TTL_MS = 60_000;
export const PROOF_TIMEOUT_MS = 25_000;
export const PROOF_MAX_ATTEMPTS = 2;

export type ProofFailureCode =
  | 'PREDICATE_FALSE'
  | 'REPLAY'
  | 'STALE'
  | 'PROVER_TIMEOUT'
  | 'PROVER_UNAVAILABLE'
  | 'INTERNAL';

export class ProofRuntimeError extends Error {
  constructor(
    public readonly code: ProofFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProofRuntimeError';
  }
}

export function assertFresh(expiresAtMs: number, nowMs = Date.now()): void {
  if (nowMs > expiresAtMs) {
    throw new ProofRuntimeError('STALE', 'Proof context expired before it could be consumed.');
  }
}

export function classifyProofError(error: unknown): ProofRuntimeError {
  if (error instanceof ProofRuntimeError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('below the transfer amount')) {
    return new ProofRuntimeError('PREDICATE_FALSE', 'Private balance does not satisfy the transfer threshold.');
  }
  if (lower.includes('already been used')) {
    return new ProofRuntimeError('REPLAY', 'This proof request has already been consumed.');
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return new ProofRuntimeError('PROVER_TIMEOUT', 'The prover did not answer before the timeout.');
  }
  if (lower.includes('worker') || lower.includes('fetch') || lower.includes('network')) {
    return new ProofRuntimeError('PROVER_UNAVAILABLE', 'The proving runtime is unavailable.');
  }
  return new ProofRuntimeError('INTERNAL', message || 'Unknown proof failure.');
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new ProofRuntimeError('PROVER_TIMEOUT', `Proof attempt timed out after ${timeoutMs} ms.`)),
      timeoutMs,
    );

    operation.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runWithProofRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<{ value: T; attempts: number }> {
  const attempts = options.attempts ?? PROOF_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? PROOF_TIMEOUT_MS;
  let lastError: ProofRuntimeError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await withTimeout(operation(), timeoutMs);
      return { value, attempts: attempt };
    } catch (error) {
      const classified = classifyProofError(error);
      lastError = classified;

      // Domain failures must never be retried as if they were infrastructure noise.
      if (classified.code === 'PREDICATE_FALSE' || classified.code === 'REPLAY' || classified.code === 'STALE') {
        throw classified;
      }

      if (attempt === attempts) throw classified;
    }
  }

  throw lastError ?? new ProofRuntimeError('INTERNAL', 'Proof operation failed without an error.');
}
