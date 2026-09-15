import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as compactRuntime from '@midnight-ntwrk/compact-runtime';
import { check } from '@midnight-ntwrk/zkir-v2';
import { Contract } from '../managed/privaterisk/contract/index.js';
import { witnesses, type PrivateRiskPrivateState } from './witnesses.js';

const CIRCUIT = 'proveBalanceForTransfer';
const MANAGED_DIR = join(process.cwd(), 'managed', 'privaterisk');
const POLICY_VERSION = new Uint8Array(32).fill(7);
const EXPIRY = 2_000_000_000_000n;

function executePrivateBalancePredicate(balance: bigint, transferAmount: bigint) {
  const contract = new Contract<PrivateRiskPrivateState>(witnesses);
  const privateState: PrivateRiskPrivateState = { balance };
  const initialZswapLocalState = { coinPublicKey: new Uint8Array(32) };
  const initial = contract.initialState({
    initialZswapLocalState,
    initialPrivateState: privateState,
  });

  const context = compactRuntime.createCircuitContext(
    compactRuntime.dummyContractAddress(),
    initialZswapLocalState.coinPublicKey,
    initial.currentContractState.data,
    initial.currentPrivateState,
  );

  return contract.circuits.proveBalanceForTransfer(
    context,
    new Uint8Array(32).fill(9),
    transferAmount,
    POLICY_VERSION,
    EXPIRY,
  );
}

const keyProvider = {
  async lookupKey(keyLocation: string) {
    return {
      proverKey: readFileSync(join(MANAGED_DIR, 'keys', `${keyLocation}.prover`)),
      verifierKey: readFileSync(join(MANAGED_DIR, 'keys', `${keyLocation}.verifier`)),
      ir: readFileSync(join(MANAGED_DIR, 'zkir', `${keyLocation}.bzkir`)),
    };
  },
  async getParams(k: number) {
    const home = process.env.HOME;
    if (!home) throw new Error('HOME is required to load Compact PLONK params');
    return readFileSync(join(home, '.compact', 'params', `params_${k}.bin`));
  },
};

describe('PrivateRisk real Midnight PLONK verification', () => {
  it('accepts a proof that €27k private balance satisfies the €15k public threshold', async () => {
    const circuitResult = executePrivateBalancePredicate(27_000n, 15_000n);
    const proofData = circuitResult.proofData;

    const serializedPreimage = compactRuntime.proofDataIntoSerializedPreimage(
      proofData.input,
      proofData.output,
      proofData.publicTranscript,
      proofData.privateTranscriptOutputs,
      CIRCUIT,
    );

    const outputs = await check(serializedPreimage, keyProvider);

    expect(outputs).toBeDefined();
    expect(circuitResult.context.currentPrivateState.balance).toBe(27_000n);
  }, 120_000);
});
