import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import {
  createLogger,
  FaucetClient,
  FluentWalletBuilder,
  getTestEnvironment,
  initializeMidnightProviders,
  MidnightWalletProvider,
} from '@midnight-ntwrk/testkit-js';
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

function waitForWalletState(walletFacade, predicate, label, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    let subscription;
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      subscription?.unsubscribe();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    subscription = walletFacade.state().subscribe({
      next(state) {
        if (done) return;
        try {
          if (!predicate(state)) return;
          done = true;
          clearTimeout(timer);
          subscription?.unsubscribe();
          resolve(state);
        } catch (error) {
          done = true;
          clearTimeout(timer);
          subscription?.unsubscribe();
          reject(error);
        }
      },
      error(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

async function createFundedWallet(environmentConfiguration) {
  const injectedSeed = process.env.MN_TEST_WALLET_SEED?.trim();
  const masterSeed = injectedSeed || randomBytes(32).toString('hex');

  // Build through the official testkit primitives, but deliberately avoid
  // getMidnightWalletProvider()/waitForFunds(). The stock helper waits for
  // shielded + unshielded + dust to all fully sync before it asks the faucet;
  // on Preprod that scan exhausted a GitHub runner heap. For deployment we can
  // safely advance through the minimum required states: unshielded NIGHT first,
  // then dust, while the shielded wallet continues in the background.
  const builder = FluentWalletBuilder.forEnvironment(environmentConfiguration).withSeed(masterSeed);
  const built = await builder.buildWithoutStarting();
  const provider = await MidnightWalletProvider.withWallet(
    logger,
    environmentConfiguration,
    built.wallet,
    built.seeds,
    built.keystore,
  );

  await provider.start(false);

  const nightTokenRaw = unshieldedToken().raw;
  const address = provider.unshieldedKeystore.getBech32Address().asString();

  let state = await waitForWalletState(
    provider.wallet,
    (next) => next.unshielded.progress.isStrictlyComplete() === true,
    'Unshielded wallet sync',
    45_000,
  );

  let nightBalance = state.unshielded.balances[nightTokenRaw] ?? 0n;
  if (nightBalance <= 0n) {
    if (!environmentConfiguration.faucet) {
      throw new Error('Preprod faucet is not configured and the deployment wallet has no NIGHT.');
    }

    evidence.state = 'FUNDING_WALLET';
    logger.info('Deployment wallet has no NIGHT; requesting Preprod faucet funds.');
    await new FaucetClient(environmentConfiguration.faucet, logger).requestTokens(address);

    state = await waitForWalletState(
      provider.wallet,
      (next) => (next.unshielded.balances[nightTokenRaw] ?? 0n) > 0n,
      'Preprod NIGHT funding',
      90_000,
    );
    nightBalance = state.unshielded.balances[nightTokenRaw] ?? 0n;
  }

  let dustBalance = state.dust.balance(new Date());
  let dustRegistrationTxId = null;
  if (dustBalance <= 0n) {
    const unregistered = state.unshielded.availableCoins.filter(
      (coin) => coin.utxo.type === nightTokenRaw && coin.meta.registeredForDustGeneration === false,
    );

    if (unregistered.length === 0) {
      throw new Error('NIGHT arrived but no unregistered NIGHT UTXO is available for dust generation.');
    }

    evidence.state = 'REGISTERING_DUST';
    logger.info(`Registering ${unregistered.length} NIGHT UTXO(s) for dust generation.`);
    const recipe = await provider.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      provider.unshieldedKeystore.getPublicKey(),
      (payload) => provider.unshieldedKeystore.signDataAsync(payload),
    );
    const finalized = await provider.wallet.finalizeRecipe(recipe);
    dustRegistrationTxId = await provider.wallet.submitTransaction(finalized);

    state = await waitForWalletState(
      provider.wallet,
      (next) => next.dust.balance(new Date()) > 0n,
      'Dust generation',
      90_000,
    );
    dustBalance = state.dust.balance(new Date());
  }

  return {
    provider,
    walletEvidence: {
      seedSource: injectedSeed ? 'injected-env' : 'ephemeral-generated',
      unshieldedAddressPrefix: address.slice(0, 20),
      coinPublicKeyPrefix: String(provider.getCoinPublicKey()).slice(0, 16),
      nightBalance: String(nightBalance),
      dustBalance: String(dustBalance),
      dustRegistrationTxId,
    },
  };
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
  walletSeedSource: process.env.MN_TEST_WALLET_SEED ? 'injected-env' : 'ephemeral-generated',
};

let env;
let wallet;
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

  const walletResult = await createFundedWallet(environmentConfiguration);
  wallet = walletResult.provider;
  evidence.wallet = walletResult.walletEvidence;
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
  evidence.error = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) };
  await fs.writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.error('PRIVATERISK_PREPROD_DEPLOYMENT=' + JSON.stringify(evidence));
  process.exitCode = 1;
} finally {
  if (wallet) await wallet.stop().catch(() => undefined);
  if (env) await env.shutdown().catch(() => undefined);
}
