import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { createLogger, getTestEnvironment, initializeMidnightProviders } from '@midnight-ntwrk/testkit-js';
import * as Generated from '../contracts/midnight/managed/privaterisk/contract/index.js';

globalThis.WebSocket = WebSocket;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const compiledRoot = path.resolve(repoRoot, 'contracts/midnight/managed/privaterisk');
const evidencePath = path.resolve(repoRoot, 'evidence/V0.6_PREPROD_DEPLOYMENT.json');
const logPath = path.resolve(repoRoot, 'evidence', `preprod-${Date.now()}.log`);

const logger = createLogger(logPath);
const privateStateId = 'privaterisk-preprod-v0.6';
const initialPrivateState = { balance: 27_000n };
const witnesses = {
  privateBalance: ({ privateState }) => [privateState, privateState.balance],
};

const compiledContract = CompiledContract.make('PrivateRisk', Generated.Contract).pipe(
  CompiledContract.withWitnesses(witnesses),
  CompiledContract.withCompiledFileAssets(compiledRoot),
);

class PrivateRiskConfiguration {
  constructor() {
    this.privateStateStoreName = `privaterisk-preprod-${Date.now()}`;
    this.zkConfigPath = compiledRoot;
  }
}

const startedAt = new Date().toISOString();
const evidence = {
  version: '0.6.0',
  network: 'preprod',
  startedAt,
  state: 'STARTING',
  contractAddress: null,
  transactionId: null,
  blockHeight: null,
  walletSeedSource: process.env.MN_TEST_WALLET_SEED ? 'injected-env' : 'ephemeral-testkit',
};

let env;
try {
  process.env.MN_TEST_ENVIRONMENT = 'preprod';
  env = getTestEnvironment(logger);
  const environmentConfiguration = await env.start();
  evidence.endpoints = {
    indexer: environmentConfiguration.indexer,
    indexerWS: environmentConfiguration.indexerWS,
    node: environmentConfiguration.node,
  };
  evidence.state = 'ENVIRONMENT_READY';

  const wallet = await env.getMidnightWalletProvider();
  evidence.wallet = {
    coinPublicKeyPrefix: String(wallet.getCoinPublicKey()).slice(0, 16),
  };
  evidence.state = 'WALLET_READY';

  const providers = initializeMidnightProviders(wallet, environmentConfiguration, new PrivateRiskConfiguration());
  evidence.state = 'DEPLOYING';

  const deployed = await deployContract(providers, {
    compiledContract,
    privateStateId,
    initialPrivateState,
  });

  const pub = deployed.deployTxData.public;
  evidence.state = 'FINALIZED';
  evidence.contractAddress = pub.contractAddress;
  evidence.transactionId = pub.txId ?? null;
  evidence.blockHeight = pub.blockHeight != null ? String(pub.blockHeight) : null;
  evidence.completedAt = new Date().toISOString();
  evidence.truthBoundary = 'Concrete identifiers are copied only from Midnight.js finalized deployTxData.';

  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log('PRIVATERISK_PREPROD_DEPLOYMENT=' + JSON.stringify(evidence));
} catch (error) {
  evidence.state = 'BLOCKED';
  evidence.completedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.error('PRIVATERISK_PREPROD_DEPLOYMENT=' + JSON.stringify(evidence));
  process.exitCode = 1;
} finally {
  if (env) await env.shutdown().catch(() => undefined);
}
