# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

The first demo evaluates a high-value transfer from a new device. An evidence-planning agent requests only the minimum claims needed, a Privacy Guardian rejects over-broad requests, a proof-verifier boundary establishes claims, and a deterministic policy engine decides whether to approve, challenge, or review.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.1 demo

Canonical scenario:

`€15,000 + new device + new recipient → verified predicates → CHALLENGE → step-up auth → APPROVED`

The demo makes each authority boundary visible and reports **raw private fields disclosed = 0**.

### What ships

- bounded evidence-planning agent
- Privacy Guardian enforcing minimum-necessary disclosure
- predicate claims instead of raw values where possible
- proof-verifier abstraction (`MockProofVerifier` first, Midnight adapter next)
- transparent fraud scoring
- deterministic `APPROVE | CHALLENGE | REVIEW` policy
- step-up authentication path
- visual decision trace and audit explanation
- privacy metrics
- automated core-policy test

## Architecture principle

**Reasoning, proof, prediction, and authority are different jobs.**

1. **Agent** — decides which evidence is useful.
2. **Cryptography** — establishes whether claims are valid.
3. **Fraud scoring** — estimates risk.
4. **Policy** — determines allowed actions.
5. **Human / strong auth** — handles high-risk exceptions and challenges.

The agent never directly freezes an account or releases funds.

```text
Transaction
    ↓
Evidence Planner
    ↓
Privacy Guardian
    ↓
Proof Verifier
    ↓
Fraud Scorer
    ↓
Policy Engine
    ↓
APPROVE / CHALLENGE / REVIEW
```

## Why ZK / Midnight?

The goal is not to put banking data on-chain. Raw PII, balances, transaction histories, and device histories stay private/off-chain.

A future Midnight-backed verifier should prove predicates such as:

- `KYC_VALID`
- `ACCOUNT_AGE_GT_365`
- `NO_ACTIVE_COMPROMISE`
- `BALANCE_GT_TRANSFER`

without revealing the underlying DOB, opening date, fraud history, or balance.

See [`contracts/midnight/README.md`](contracts/midnight/README.md) for the V0.2 integration target.

## Run locally

```bash
npm install
npm run dev
```

Test + production build:

```bash
npm test
npm run build
```

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

See `.ai-build/` for the product contract, architecture, and acceptance criteria.

## Status

**V0.1:** product vertical slice in review.

**V0.2:** real Midnight/Compact predicate-proof spike.

---

**Trust shouldn't require surrendering all your information.**
