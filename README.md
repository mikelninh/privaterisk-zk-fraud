# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

A bounded evidence-planning agent asks for the minimum facts needed, a Privacy Guardian blocks over-broad data requests, cryptographic evidence establishes selected predicates, a fraud layer estimates risk, and deterministic policy owns the final action boundary.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.6 — public service + real Preprod deployment gate

V0.6 moves PrivateRisk toward a network-connected infrastructure proof:

- public HTTPS trust-service deployment is being established outside GitHub Pages
- ES256 issuer keys remain server-side; browser consumes signed predicates + public keys only
- live browser Compact/PLONK `BALANCE_GT_TRANSFER` proof remains intact
- deterministic policy remains the final action boundary
- a dedicated Midnight Preprod deployment workflow now compiles the real Compact contract, creates/uses a test wallet through Midnight testkit, deploys with Midnight.js, and refuses to pass unless a concrete contract address + deployment tx id are returned
- deployment evidence is uploaded as a workflow artifact whether the network succeeds or fails
- no fabricated `SUBMITTED`, `CONFIRMED`, or `FINAL` state is allowed

### Network truth gate

The V0.6 workflow uses the current documented Midnight testkit pattern:

`MN_TEST_ENVIRONMENT=preprod → getTestEnvironment() → wallet → initializeMidnightProviders() → deployContract()`

The wallet seed is either injected through `MN_TEST_WALLET_SEED` or generated ephemerally by the testkit. No reusable seed is committed.

The release is only considered network-complete when `evidence/V0.6_PREPROD_DEPLOYMENT.json` contains:

```text
state: FINALIZED
contractAddress: <real Midnight address>
transactionId: <real Midnight tx id>
```

If Preprod funding, package compatibility, faucet availability, or network health blocks the write, the workflow fails and records the exact blocker instead.

## V0.5 — external trust service + tamper-evident audit

Canonical scenario:

`payment event → external signed attestations + live ZK proof → deterministic policy → hash-chain audit → CHALLENGE`

V0.5 moved the issuer and audit boundaries out of the browser in the verified pilot path:

- Kafka-compatible `payments.transaction.created` event envelope
- external HTTP trust service for signed evidence
- service-side ES256 issuer private keys; browser gets only signed claims + public verification keys
- browser-side verification of issuer/key permissions, subject binding, event binding, expiry and signature
- live Compact/PLONK `BALANCE_GT_TRANSFER` proof remains local to the private proving boundary
- deterministic fail-closed fraud policy
- server-side append-only SHA-256 hash-chain audit log with idempotency
- audit-chain integrity verification endpoint
- read-only Midnight Preprod node/indexer connectivity probe

## Privacy / authority boundary

Reasoning, proof, prediction and authority are different jobs:

1. **Agent** — decides which evidence is useful.
2. **Privacy Guardian** — enforces minimum-necessary disclosure.
3. **Authorised issuers** — sign specific allowed claims.
4. **Compact / PLONK** — proves the private balance predicate.
5. **Fraud scoring** — estimates risk.
6. **Policy** — determines permitted actions.
7. **Human / strong auth** — handles high-risk exceptions and challenges.

The agent never directly freezes an account or releases funds. Missing/invalid critical evidence does not become `true`; the system fails closed to `REVIEW`.

## Run locally

```bash
npm install --legacy-peer-deps
npm run midnight:compile
npm run midnight:stage
npm run pilot-api
```

Then:

```bash
VITE_PILOT_API_URL=http://127.0.0.1:8787 npm run dev
```

Tests:

```bash
npm test
npm run test:pilot-api
npm run build
```

Preprod deployment attempt:

```bash
MN_TEST_ENVIRONMENT=preprod npm run midnight:preprod-deploy
```

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

## Roadmap

- **V0.1** — bounded fraud-decision vertical slice ✅
- **V0.2** — real Midnight Compact / PLONK funding predicate ✅
- **V0.3** — live/on-demand browser proving ✅
- **V0.4** — signed attestations + event contract + browser pilot audit ✅
- **V0.5** — external trust service + hash-chain audit + Preprod read probe ✅
- **V0.6** — public HTTPS service + real Midnight Preprod deployment gate 🚧
- **Production hardening** — HSM/KMS, mTLS/service identity, durable storage, HA/SLOs, observability, security/compliance, real fraud data and model/rule governance

---

**Trust shouldn't require surrendering all your information.**
