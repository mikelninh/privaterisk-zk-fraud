# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

A bounded evidence-planning agent asks for the minimum facts needed, a Privacy Guardian blocks over-broad data requests, cryptographic evidence establishes selected predicates, a fraud layer estimates risk, and deterministic policy owns the final action boundary.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.4 — signed attestations + live ZK pilot

Canonical scenario:

`payment event → minimum evidence → 3 signed attestations + live ZK proof → CHALLENGE → step-up auth → APPROVED`

V0.4 turns the V0.3 cryptographic proof into a more realistic financial-integration slice:

- Kafka-compatible `payments.transaction.created` event envelope
- ES256-signed `KYC_VALID`, `ACCOUNT_AGE_GT_365`, and `NO_ACTIVE_COMPROMISE` attestations
- authorised issuer registry with claim-level permissions
- subject + event binding, expiry, tamper detection and unknown-issuer rejection
- live browser Compact/PLONK proof for `BALANCE_GT_TRANSFER`
- deterministic fail-closed fraud policy
- browser-persistent append-only audit records
- explicit Midnight network truth states

```text
Payment Event
      ↓
Evidence Planner
      ↓
Privacy Guardian
      ↓
┌───────────────────────────────┐
│ Authorised evidence providers │
│ Identity → KYC_VALID          │
│ Bank     → TENURE_GT_365      │
│ Fraud    → NO_COMPROMISE      │
└──────────────┬────────────────┘
               ↓ signed ES256 attestations
Private balance ──→ Compact / PLONK browser proof
               ↓
        verified predicates only
               ↓
          Fraud Scorer
               ↓
      Deterministic Policy
               ↓
    APPROVE / CHALLENGE / REVIEW
               ↓
        append-only audit
```

## Evidence maturity

| Claim | V0.4 status |
|---|---|
| `KYC_VALID` | **Signed ES256 demo attestation, authorised issuer registry** |
| `ACCOUNT_AGE_GT_365` | **Signed ES256 demo attestation, authorised issuer registry** |
| `NO_ACTIVE_COMPROMISE` | **Signed ES256 demo attestation, authorised issuer registry** |
| `BALANCE_GT_TRANSFER` | **Live browser Compact / PLONK proof** |

The demo issuers create **ephemeral, non-exportable signing keys at runtime**. No reusable private issuer key is committed to this public repository. This is still a simulation of issuer onboarding: production attestor keys belong in controlled HSM/KMS/MPC-style custody.

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

## Event contract

The pilot uses an explicit Kafka-compatible envelope:

```text
topic:         payments.transaction.created
key:           subject id
schemaVersion: 1.0
eventId:       unique event id
payload:       transaction id + risk context
```

The project does not claim that GitHub Pages itself is connected to a production Kafka cluster. The event shape is the adapter boundary for that future integration.

## Durable audit

Each successful pilot run writes an append-only browser audit record containing:

- event + transaction IDs
- correlation ID
- policy version
- risk score + decision
- proof latency
- evidence provenance / digests
- network truth state
- raw-fields-disclosed metric

The current browser store persists across refreshes and is deliberately an interface boundary, not a substitute for a production append-only database/event log.

## Midnight network truth

V0.4 keeps the local proof and network lifecycle separate.

Current UI state:

```text
local PLONK proof:     REAL
Preprod submission:    NOT CONFIGURED
contract address:      NONE CLAIMED
network transaction:   NONE CLAIMED
```

The code has explicit states for local proof, Preprod submission, confirmation and finality, and rejects a submitted/confirmed/final receipt without concrete chain identifiers.

See [`docs/MIDNIGHT_PREPROD_RUNBOOK.md`](docs/MIDNIGHT_PREPROD_RUNBOOK.md) for the next network gate.

## Verification

PR CI covers:

- core fraud-policy tests
- signed-attestation success / tamper / expiry / unknown-issuer cases
- event-contract + audit-store + network-truth tests
- Compact compilation and browser proving assets
- production Vite build
- real Chromium run of the production bundle
- fresh PLONK proof
- all three signed issuer attestations visible
- durable audit record survives refresh
- explicit `WITHHELD` / `NOT SUBMITTED` truth boundaries

## Run locally

```bash
npm install --legacy-peer-deps
npm run midnight:compile
npm run midnight:stage
npm run dev
```

Test + production build:

```bash
npm test
npm run build
```

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

See `.ai-build/` for the product contract, architecture, acceptance criteria and operating guardrails.

## Roadmap

- **V0.1** — bounded fraud-decision vertical slice ✅
- **V0.2** — real Midnight Compact / PLONK funding predicate ✅
- **V0.3** — live/on-demand browser proving ✅
- **V0.4** — signed issuer attestations + event contract + durable pilot audit 🚧
- **V0.5** — real Midnight Preprod lifecycle + external issuer adapter
- **Production hardening** — HSM/KMS custody, HA, observability, security/compliance, real fraud data, rule/model governance and operational controls

---

**Trust shouldn't require surrendering all your information.**
