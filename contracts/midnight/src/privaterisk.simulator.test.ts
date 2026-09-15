import { describe, expect, it } from 'vitest';
import {
  createCircuitContext,
  createConstructorContext,
  sampleContractAddress,
  type CircuitContext,
} from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import {
  Contract,
  ledger,
  type Ledger,
} from '../managed/privaterisk/contract/index.js';
import {
  witnesses,
  type PrivateRiskPrivateState,
} from './witnesses.js';

const SAMPLE_COIN_PUBLIC_KEY = 'ca'.repeat(32);
const EXPIRY = 2_000_000_000_000n;

function createHarness(balance: bigint): {
  contract: Contract<PrivateRiskPrivateState>;
  context: CircuitContext<PrivateRiskPrivateState>;
  getLedger: () => Ledger;
} {
  const contract = new Contract<PrivateRiskPrivateState>(witnesses);
  const initialPrivateState: PrivateRiskPrivateState = { balance };
  const {
    currentPrivateState,
    currentContractState,
    currentZswapLocalState,
  } = contract.initialState(
    createConstructorContext(initialPrivateState, SAMPLE_COIN_PUBLIC_KEY),
  );

  let context = createCircuitContext(
    sampleContractAddress(),
    currentZswapLocalState,
    currentContractState,
    currentPrivateState,
  );

  return {
    contract,
    get context() {
      return context;
    },
    set context(next: CircuitContext<PrivateRiskPrivateState>) {
      context = next;
    },
    getLedger: () => ledger(context.currentQueryContext.state),
  };
}

function bytes32(seed: number): Uint8Array {
  return new Uint8Array(32).fill(seed);
}

describe('PrivateRisk Midnight Compact balance predicate', () => {
  it('accepts €15k when the private balance is €27k and binds policy/expiry context', () => {
    const harness = createHarness(27_000n);
    const id = bytes32(1);

    const result = harness.contract.impureCircuits.proveBalanceForTransfer(
      harness.context,
      id,
      15_000n,
      bytes32(7),
      EXPIRY,
    );
    harness.context = result.context;

    expect(harness.context.currentPrivateState.balance).toBe(27_000n);
    expect(harness.getLedger().verifiedRequests.member(id)).toBe(true);
    expect(harness.getLedger().proofCount).toBe(1n);
  });

  it('rejects when the private balance does not satisfy the public transfer threshold', () => {
    const harness = createHarness(14_999n);

    expect(() =>
      harness.contract.impureCircuits.proveBalanceForTransfer(
        harness.context,
        bytes32(2),
        15_000n,
        bytes32(7),
        EXPIRY,
      ),
    ).toThrow('Private balance is below the transfer amount');
  });

  it('rejects replay of a request id after a successful predicate proof', () => {
    const harness = createHarness(27_000n);
    const id = bytes32(3);

    const first = harness.contract.impureCircuits.proveBalanceForTransfer(
      harness.context,
      id,
      15_000n,
      bytes32(7),
      EXPIRY,
    );
    harness.context = first.context;

    expect(() =>
      harness.contract.impureCircuits.proveBalanceForTransfer(
        harness.context,
        id,
        15_000n,
        bytes32(7),
        EXPIRY,
      ),
    ).toThrow('PrivateRisk request has already been used');
  });

  it('rejects missing expiry context', () => {
    const harness = createHarness(27_000n);

    expect(() =>
      harness.contract.impureCircuits.proveBalanceForTransfer(
        harness.context,
        bytes32(4),
        15_000n,
        bytes32(7),
        0n,
      ),
    ).toThrow('PrivateRisk proof expiry is required');
  });
});
