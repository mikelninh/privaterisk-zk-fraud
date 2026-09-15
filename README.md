# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

A bounded evidence-planning agent asks for the minimum facts needed, a Privacy Guardian blocks over-broad data requests, cryptographic evidence establishes selected predicates, a fraud layer estimates risk, and deterministic policy owns the final action boundary.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.5 — external trust service + tamper-evident audit

Canonical scenario:

`payment event → external signed attestations + live ZK proof → deterministic policy → hash-chain audit → CHALLENGE`

V0.5 moves the issuer and audit boundaries **out of the browser** in the verified pilot path:

- Kafka-compatible `payments.transaction.created` event envelope
- external HTTP trust service for signed evidence
- service-side ES256 issuer private keys; browser gets only signed claims + public verification keys
- browser-side verification of issuer/key permissions, subject binding, event binding, expiry and signature
- live Compact/PLONK `BALANCE_GT_TRANSFER` proof remains local to the private proving boundary
- deterministic fail-closed fraud policy
- server-side append-only SHA-256 hash-chain audit log with idempotency
- audit-chain integrity verification endpoint
- read-only Midnight Preprod node/indexer connectivity probe
- explicit network-write truth state: **NOT CONFIGURED** until a real signed transaction exists

```text
payments.transaction.created
          ↓
   Evidence Planner
          ↓
   Privacy Guardian
          ↓
 ┌──────────────────────────┐
 │ External Trust Service   │
 │ KYC           → ES256    │
 │ Account age   → ES256    │
 │ Compromise    → ES256    │
 └──────────────┬───────────┘
                ↓ signed predicates
 Private balance ──→ Compact / PLONK
                ↓
       verified claims only
                ↓
          Fraud Scorer
                ↓
      Deterministic Policy
                ↓
    APPROVE / CHALLENGE / REVIEW
                ↓
   tamper-evident hash-chain audit
```

## Evidence maturity

| Claim | V0.5 status |
|---|---|
| `KYC_VALID` | **External service ES256 attestation** |
| `ACCOUNT_AGE_GT_365` | **External service ES256 attestation** |
| `NO_ACTIVE_COMPROMISE` | **External service ES256 attestation** |
| `BALANCE_GT_TRANSFER` | **Live browser Compact / PLONK proof** |

The external-service CI path never sends issuer private keys to the browser or exposes them in API responses. Demo keys are still process-local development keys, not production HSM/KMS custody.

## Audit integrity

The pilot API stores decision receipts as an append-only chain:

```text
GENESIS
  ↓
record 0 + previousHash → SHA-256 hash 0
  ↓
record 1 + hash 0       → SHA-256 hash 1
  ↓
...
```

Each record includes event/transaction identifiers, correlation ID, policy version, decision, risk score, evidence provenance/digests, proof latency, network truth state and the raw-fields-disclosed metric. Reusing the same decision idempotency key returns the existing entry rather than creating a duplicate.

This is **tamper-evident**, not yet a production immutable ledger. Real deployment still needs durable database/event-store storage, retention policy, backups and access controls.

## Midnight Preprod truth boundary

V0.5 adds a real read-only connectivity probe against the official Preprod node/indexer endpoints, but deliberately does not claim a chain write.

```text
local PLONK proof:       REAL
Preprod read probe:      REAL HTTP probe
Preprod submission:      NOT CONFIGURED
contract address:        NONE CLAIMED
network transaction:     NONE CLAIMED
```

A future version may only show `SUBMITTED`, `CONFIRMED` or `FINAL` after a verifiable contract address and transaction identifier exist.

## Verification

CI covers:

- core fraud-policy tests
- signed-attestation tamper / expiry / unknown-issuer cases
- service-side attestation + idempotency self-test
- server hash-chain integrity + tamper detection
- Compact compilation and real browser proving assets
- production Vite build configured against the external pilot API
- real Chromium decision flow through **HTTP service → attestations → PLONK proof → policy → server audit**
- audit integrity endpoint after the browser decision
- explicit `WITHHELD`, `EXTERNAL HTTP`, `CHAIN VERIFIED`, and `WRITE STATE: NOT CONFIGURED` truth boundaries

Verification evidence: [`evidence/V0.5_EXTERNAL_SERVICE.md`](evidence/V0.5_EXTERNAL_SERVICE.md)

## Run the full V0.5 pilot locally

Terminal 1:

```bash
npm install --legacy-peer-deps
npm run pilot-api
```

Terminal 2:

```bash
npm run midnight:compile
npm run midnight:stage
VITE_PILOT_API_URL=http://127.0.0.1:8787 npm run dev
```

Tests:

```bash
npm test
npm run test:pilot-api
npm run build
```

GitHub Pages has no persistent backend, so if `VITE_PILOT_API_URL` is not configured the public static demo explicitly falls back to ephemeral browser issuers/local audit storage. That fallback is labelled in the UI and is **not** presented as the V0.5 external-service boundary.

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

See `.ai-build/` for acceptance criteria and operating guardrails.

## Roadmap

- **V0.1** — bounded fraud-decision vertical slice ✅
- **V0.2** — real Midnight Compact / PLONK funding predicate ✅
- **V0.3** — live/on-demand browser proving ✅
- **V0.4** — signed attestations + event contract + browser pilot audit ✅
- **V0.5** — external trust service + hash-chain audit + Preprod read probe ✅
- **V0.6** — real Midnight Preprod submission/confirmation + deployed external service
- **Production hardening** — HSM/KMS, mTLS/service identity, durable storage, HA/SLOs, observability, security/compliance, real fraud data and model/rule governance

---

**Trust shouldn't require surrendering all your information.**
