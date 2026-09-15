# Midnight Preprod deployment runbook

PrivateRisk V0.4 deliberately stops at a truthful network boundary: the browser creates the Compact/PLONK proof locally, while the UI reports `PREPROD_NOT_CONFIGURED` until a real network submission exists.

This document describes the next integration gate. It is not proof that PrivateRisk is already deployed to Preprod.

## Current official Preprod service configuration

Midnight's current `PreprodTestEnvironment` in `midnight-js` defines:

```text
networkId: preprod
indexer:   https://indexer.preprod.midnight.network/api/v4/graphql
indexerWS: wss://indexer.preprod.midnight.network/api/v4/graphql/ws
node:      https://rpc.preprod.midnight.network
nodeWS:    wss://rpc.preprod.midnight.network
faucet:    https://faucet.preprod.midnight.network/api/drips
```

Upstream source:
`midnightntwrk/midnight-js/testkit-js/testkit-js/src/test-environment/test-environments/preprod-test-environment.ts`

The upstream E2E testkit also supports `MN_TEST_ENVIRONMENT=preprod` and an optional `MN_TEST_WALLET_SEED` for live-network integration testing.

## Security rule before any real deployment

Never put a wallet seed, signing key, production attestor key, or recovery secret into:

- the browser bundle,
- source control,
- GitHub Actions logs,
- a public `.env` file,
- the Pages deployment.

For a pilot, use a dedicated test wallet and secret store. For production, move signing/custody to HSM/KMS/MPC or an equivalent controlled boundary.

## Deployment path

1. **Create a dedicated Preprod wallet**
   - keep the seed outside the repo;
   - fund it with Preprod test assets through the official faucet/testkit flow.

2. **Use the current Midnight provider stack**
   - wallet provider;
   - node RPC;
   - indexer GraphQL + WebSocket;
   - proving provider compatible with the current Midnight.js release.

3. **Compile the current contract**

```bash
npm run midnight:compile
```

The relevant contract is `contracts/midnight/privaterisk.compact`.

4. **Deploy through Midnight.js**

Current Midnight.js exposes `deployContract(...)` from the contract package. The deployment needs a real provider set, compiled contract, private-state id and initial private state. Do not hard-code wallet material into the app.

5. **Persist deployment evidence**

A successful PrivateRisk network receipt must contain at minimum:

```text
network           = Midnight
state             = PREPROD_SUBMITTED | PREPROD_CONFIRMED | PREPROD_FINAL
contractAddress   = <real address>
transactionId     = <real chain transaction id>
checkedAt         = <timestamp>
```

`src/networkAdapter.ts` intentionally rejects a submitted/confirmed/final state without a contract address and transaction id.

6. **Observe through the indexer**
   - submission accepted by the node;
   - contract visible through the indexer;
   - circuit transaction observed;
   - confirmation/finality semantics recorded according to the current network/runtime behavior.

7. **Only then change the UI truth state**

Until all of the above is verifiable, the product must continue to say:

```text
PREPROD_NOT_CONFIGURED
NOT SUBMITTED
```

## CI / secrets plan

Recommended next step is a separate, opt-in integration workflow rather than adding wallet credentials to normal PR CI.

```text
PR CI
  -> local Compact compile
  -> unit tests
  -> browser PLONK proof smoke
  -> signed-attestation smoke

Protected Preprod workflow
  -> explicit manual trigger
  -> protected secret/environment
  -> test wallet
  -> deploy/find contract
  -> execute canonical predicate
  -> verify through indexer
  -> write evidence artifact
```

## Definition of done for V0.4 network gate

- real Preprod contract address recorded;
- real transaction id recorded;
- deployment and circuit execution are independently observable;
- wallet secret never appears in repository or logs;
- network failure is distinct from predicate failure;
- PrivateRisk can return to `LOCAL_PROOF` / `REVIEW` safely when network infrastructure is unavailable.

Until those conditions are met, network submission remains an explicit production gap rather than a marketing claim.
