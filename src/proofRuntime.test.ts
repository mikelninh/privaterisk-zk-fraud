import { describe, expect, it, vi } from 'vitest';
import {
  ProofRuntimeError,
  assertFresh,
  classifyProofError,
  runWithProofRetry,
} from './proofRuntime';

describe('proof runtime controls', () => {
  it('rejects stale proof context before policy consumption', () => {
    expect(() => assertFresh(1_000, 1_001)).toThrowError(ProofRuntimeError);
    try {
      assertFresh(1_000, 1_001);
    } catch (error) {
      expect((error as ProofRuntimeError).code).toBe('STALE');
    }
  });

  it('distinguishes predicate false from infrastructure failure', () => {
    expect(classifyProofError(new Error('Private balance is below the transfer amount')).code).toBe('PREDICATE_FALSE');
    expect(classifyProofError(new Error('proof worker crashed')).code).toBe('PROVER_UNAVAILABLE');
  });

  it('retries transient prover outage once and then succeeds', async () => {
    const op = vi.fn()
      .mockRejectedValueOnce(new Error('proof worker network unavailable'))
      .mockResolvedValueOnce('verified');

    const result = await runWithProofRetry(op, { attempts: 2, timeoutMs: 100 });

    expect(result.value).toBe('verified');
    expect(result.attempts).toBe(2);
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry predicate failures', async () => {
    const op = vi.fn().mockRejectedValue(new Error('Private balance is below the transfer amount'));

    await expect(runWithProofRetry(op, { attempts: 2, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'PREDICATE_FALSE',
    });
    expect(op).toHaveBeenCalledTimes(1);
  });
});
