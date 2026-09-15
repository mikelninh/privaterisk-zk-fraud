export type MidnightNetworkState =
  | 'LOCAL_PROOF'
  | 'PREPROD_NOT_CONFIGURED'
  | 'PREPROD_SUBMITTED'
  | 'PREPROD_CONFIRMED'
  | 'PREPROD_FINAL';

export type NetworkReceipt = {
  network: 'Midnight';
  target: 'local-only' | 'preprod';
  state: MidnightNetworkState;
  contractAddress: string | null;
  transactionId: string | null;
  explorerUrl: string | null;
  checkedAt: string;
  note: string;
};

export const MIDNIGHT_PREPROD = {
  networkId: 'preprod',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  nodeWS: 'wss://rpc.preprod.midnight.network',
  faucet: 'https://faucet.preprod.midnight.network/api/drips',
} as const;

export function localProofNetworkReceipt(): NetworkReceipt {
  return {
    network: 'Midnight',
    target: 'local-only',
    state: 'PREPROD_NOT_CONFIGURED',
    contractAddress: null,
    transactionId: null,
    explorerUrl: null,
    checkedAt: new Date().toISOString(),
    note: 'PLONK proof generated locally. No wallet/provider stack is configured to submit this proof to Midnight Preprod.',
  };
}

export function assertNetworkReceiptTruth(receipt: NetworkReceipt): void {
  if (
    (receipt.state === 'PREPROD_SUBMITTED' || receipt.state === 'PREPROD_CONFIRMED' || receipt.state === 'PREPROD_FINAL') &&
    (!receipt.contractAddress || !receipt.transactionId)
  ) {
    throw new Error('A submitted/confirmed/final network receipt requires both contract address and transaction id.');
  }
}
