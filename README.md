# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

A bounded evidence-planning agent asks for the minimum facts needed, a Privacy Guardian blocks over-broad data requests, privacy-preserving proofs establish selected predicates, a fraud layer estimates risk, and deterministic policy owns the final action boundary.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.3 — live browser PLONK proving

Canonical scenario:

`€15,000 + new device + new recipient → minimum evidence → live ZK proof → CHALLENGE → step-up auth → APPROVED`

V0.3 upgrades the funding-sufficiency claim from an independently verified CI proof to a **fresh PLONK proof generated on demand in the browser**.

```text
Private proving input:  balance = €27,000
Public threshold:       transfer = €15,000
Predicate:              balance >= transfer
Fraud/policy sees:      BALANCE_GT_TRANSFER = true
Raw balance in UI:      WITHHELD
Network submission:     NOT SUBMITTED
```

The Compact circuit binds:

- one-time request ID
- transfer threshold
- policy version
- expiry/freshness context

and keeps the raw balance in the local private proving boundary rather than exposing it to the fraud/policy layer or writing it as public ledger state.

### V0.3 proof controls

- real `@midnight-ntwrk/zkir-v2` browser WASM proving
- dedicated proof worker so the UI remains responsive
- proving/verifying keys, ZKIR and SRS slices staged into the production bundle
- replay protection
- explicit freshness / expiry
- bounded timeout + retry semantics
- separate `PREDICATE_FALSE`, replay, stale and infrastructure failure states
- fail-closed routing to `REVIEW` if required proof is unavailable
- proof latency, proof size, correlation ID and proof digest surfaced in the UI

### Browser evidence

A production CI gate launches the built app in headless Chromium, clicks **Evaluate + prove**, waits for a fresh `✓ PROOF GENERATED` result, and checks both the `WITHHELD` private-input boundary and `NOT SUBMITTED` network truth boundary.

Evidence: [`evidence/V0.3_BROWSER_PROVING.md`](evidence/V0.3_BROWSER_PROVING.md)

## Architecture

**Reasoning, proof, prediction, and authority are different jobs.**

1. **Agent** — decides which evidence is useful.
2. **Privacy Guardian** — enforces minimum-necessary disclosure.
3. **Cryptography** — establishes selected predicates.
4. **Fraud scoring** — estimates risk.
5. **Policy** — determines permitted actions.
6. **Human / strong auth** — handles high-risk exceptions and challenges.

The agent never directly freezes an account or releases funds.

```text
Transaction event
      ↓
Evidence Planner
      ↓
Privacy Guardian
      ↓
Private provider state
      ↓
Compact + PLONK browser prover
      ↓
verified predicate only
      ↓
Fraud Scorer
      ↓
Deterministic Policy
      ↓
APPROVE / CHALLENGE / REVIEW
```

## Current claim maturity

| Claim | Status |
|---|---|
| `BALANCE_GT_TRANSFER` | **Live browser Compact / PLONK proof** |
| `KYC_VALID` | Synthetic provider attestation |
| `ACCOUNT_AGE_GT_365` | Synthetic provider attestation |
| `NO_ACTIVE_COMPROMISE` | Synthetic provider attestation |

This distinction is intentional and visible in the decision trace.

## Truth boundary

V0.3 proves the local/browser proving path. It does **not** yet claim Midnight Preprod/Mainnet submission or settlement, production wallet/key custody, authorised external attestors, live bank integration, regulatory approval, or production fraud-model performance.

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
- **V0.4** — Midnight network adapter + authorised attestors + richer fraud-event integration
- **Production hardening** — key custody, HA, observability, security/compliance, live fraud data and operational controls

---

**Trust shouldn't require surrendering all your information.**
