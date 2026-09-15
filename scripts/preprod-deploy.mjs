import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { firstValueFrom, filter, timeout as rxTimeout } from 'rxjs';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { LedgerParameters, unshieldedToken } from '@midnight-ntwrk/midnight-js-protocol/ledger';
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

async function waitForWalletState(walletFacade, predicate, label, timeoutMs) {
  try {
    return await firstValueFrom(
      walletFacade.state().pipe(
        filter(predicate),
        rxTimeout({ each: timeoutMs }),
      ),
    );
  } catch (error) {
    throw new Error(`${label} timed out or failed after ${timeoutMs}ms: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function dustBalanceOf(state) {
  try {
    return state.dust.balance(new Date());
  } catch {
    return 0n;
  }
}

async function createFundedWallet(environmentConfiguration, evidence) {
  const injectedSeed = process.env.MN_TEST_WALLET_SEED?.trim();
  const masterSeed = injectedSeed || randomBytes(32).toString('hex');

  // Mirrors the current Midnight public-network guidance: build from an explicit
  // seed, avoid the testkit's all-channel waitForFunds helper, give DUST a small
  // fee overhead, wait only for NIGHT + the unshielded channel, then poll DUST.
  // This keeps the long Preprod wait bounded and avoids the previous 4 GB heap OOM.
  const builder = FluentWalletBuilder.forEnvironment(environmentConfiguration)
    .withDustOptions({
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    })
    .withSeed(masterSeed);

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
  evidence.wallet = {
    seedSource: injectedSeed ? 'injected-env' : 'ephemeral-generated',
    unshieldedAddress: address,
    coinPublicKeyPrefix: String(provider.getCoinPublicKey()).slice(0, 16),
    nightBalance: '0',
    dustBalance: '0',
    dustRegistrationTxId: null,
  };

  logger.info(`Preprod deployment wallet address: ${address}`);

  let state = await firstValueFrom(provider.wallet.state());
  let nightBalance = state.unshielded.balances[nightTokenRaw] ?? 0n;

  // The testkit still exposes a machine faucet endpoint. Try it once so CI can
  // complete unattended when that endpoint is available. If it is unavailable,
  // the evidence records the funded address; a persistent injected seed can then
  // be funded through the official browser faucet without changing code.
  if (nightBalance <= 0n) {
    evidence.state = 'FUNDING_WALLET';
    if (environmentConfiguration.faucet) {
      try {
        logger.info('No NIGHT yet; requesting Preprod faucet funds once.');
        await new FaucetClient(environmentConfiguration.faucet, logger).requestTokens(address);
        evidence.wallet.faucetRequest = 'submitted';
      } catch (error) {
        evidence.wallet.faucetRequest = 'failed';
        evidence.wallet.faucetError = error instanceof Error ? error.message : String(error);
        logger.warn(`Machine faucet request failed: ${evidence.wallet.faucetError}`);
      }
    } else {
      evidence.wallet.faucetRequest = 'not-configured';
    }

    state = await waitForWalletState(
      provider.wallet,
      (next) => (next.unshielded.balances[nightTokenRaw] ?? 0n) > 0n,
      'Preprod NIGHT funding',
      120_000,
    );
    nightBalance = state.unshielded.balances[nightTokenRaw] ?? 0n;
  }

  evidence.wallet.nightBalance = String(nightBalance);
  logger.info(`NIGHT available: ${nightBalance}`);

  // Freshly-funded NIGHT must be fully visible in the unshielded channel before
  // registering its UTXOs for DUST generation.
  state = await waitForWalletState(
    provider.wallet,
    (next) => next.unshielded.progress?.isStrictlyComplete?.() === true,
    'Unshielded wallet sync',
    120_000,
  );

  let dustBalance = dustBalanceOf(state);
  if (dustBalance <= 0n) {
    const unregistered = state.unshielded.availableCoins.filter(
      (coin) => coin.utxo.type === nightTokenRaw && coin.meta.registeredForDustGeneration === false,
    );

    if (unregistered.length > 0) {
      evidence.state = 'REGISTERING_DUST';
      logger.info(`Registering ${unregistered.length} NIGHT UTXO(s) for DUST generation.`);
      const recipe = await provider.wallet.registerNightUtxosForDustGeneration(
        unregistered,
        provider.unshieldedKeystore.getPublicKey(),
        (payload) => provider.unshieldedKeystore.signDataAsync(payload),
      );
      const finalized = await provider.wallet.finalizeRecipe(recipe);
      evidence.wallet.dustRegistrationTxId = await provider.wallet.submitTransaction(finalized);
      logger.info(`DUST registration submitted: ${evidence.wallet.dustRegistrationTxId}`);
    } else {
      logger.info('NIGHT UTXOs are already registered for DUST generation.');
    }

    // Official guidance recommends polling here instead of holding another long
    // wallet-state subscription open. Preprod DUST commonly takes 1–2 minutes.
    evidence.state = 'WAITING_FOR_DUST';
    const dustDeadline = Date.now() + 180_000;
    while (Date.now() < dustDeadline) {
      state = await firstValueFrom(provider.wallet.state());
      dustBalance = dustBalanceOf(state);
      evidence.wallet.dustBalance = String(dustBalance);
      logger.info(`DUST balance: ${dustBalance}`);
      if (dustBalance > 0n) break;
      await new Promise((resolve) => setTimeout(resolve, 15_000));
    }
  }

  if (dustBalance <= 0n) {
    throw new Error(
      injectedSeed
        ? `No spendable DUST became available. Fund/confirm the persistent Preprod wallet ${address} and re-run.`
        : 'No spendable DUST became available for the ephemeral wallet. A persistent MN_TEST_WALLET_SEED may be required for manual Preprod faucet funding.',
    );
  }

  evidence.wallet.dustBalance = String(dustBalance);
  return provider;
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

  wallet = await createFundedWallet(environmentConfiguration, evidence);
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
