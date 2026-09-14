import type { WitnessContext } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import type { Ledger } from '../managed/privaterisk/contract/index.js';

export type PrivateRiskPrivateState = {
  balance: bigint;
};

export const witnesses = {
  privateBalance: ({
    privateState,
  }: WitnessContext<Ledger, PrivateRiskPrivateState>): [PrivateRiskPrivateState, bigint] => [
    privateState,
    privateState.balance,
  ],
};
