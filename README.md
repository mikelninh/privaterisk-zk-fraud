# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: **financial trust should not require exposing all underlying financial data.**

A bounded evidence-planning agent asks for the minimum facts needed, a Privacy Guardian blocks over-broad data requests, privacy-preserving proofs establish selected predicates, a fraud layer estimates risk, and deterministic policy owns the final action boundary.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.2 — real Midnight ZK proof

Canonical scenario:

`€15,000 + new device + new recipient → minimum evidence → CHALLENGE → step-up auth → APPROVED`

V0.2 upgrades the funding-sufficiency claim from a mock boundary to a **real Midnight Compact / PLONK predicate proof**.

Synthetic proof case:

```text
Private input:     balance = €27,000
Public threshold:  transfer = €15,000
Predicate:         balance >= transfer
Public raw balance: NOT DISCLOSED
Verifier result:   ACCEPTED
```

The contract is compiled with Compact `0.31.1` **without `--skip-zk`**, producing ZKIR plus PLONK proving/verifying keys. CI executes the compiled circuit, serializes its proof data, and validates it with `@midnight-ntwrk/zkir-v2`.

Verification evidence: [`evidence/V0.2_MIDNIGHT_PLONK.md`](evidence/V0.2_MIDNIGHT_PLONK.md)

### V0.2 proof controls

- private balance enters through a Compact witness
- transfer threshold and request ID are explicit public policy context
- raw balance is never written into public ledger state
- successful request IDs are recorded to prevent replay
- insufficient balance fails the circuit
- repeated request IDs fail the circuit
- real PLONK/ZKIR checker test passes for the canonical €27k / €15k case

### Truth boundary

The browser demo **replays the independently verified V0.2 proof outcome**. It does not claim to generate a PLONK proof live in the browser, and the contract is not yet claimed as deployed to Midnight Preprod/Mainnet.

That network/client proving boundary is the next milestone.

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
Evidence Providers ──→ Midnight Compact / PLONK predicate
      ↓                         ↓
Trust claims ←──────────── accepted proof
      ↓
Fraud Scorer
      ↓
Deterministic Policy
      ↓
APPROVE / CHALLENGE / REVIEW
```

## Current claim maturity

| Claim | V0.2 status |
|---|---|
| `BALANCE_GT_TRANSFER` | **Real Compact / PLONK verification** |
| `KYC_VALID` | Synthetic provider attestation |
| `ACCOUNT_AGE_GT_365` | Synthetic provider attestation |
| `NO_ACTIVE_COMPROMISE` | Synthetic provider attestation |

This distinction is intentional and visible in the decision trace.

## Run the web demo locally

```bash
npm install
npm run dev
```

Test + production build:

```bash
npm test
npm run build
```

## Run the Midnight proof tests

The dedicated GitHub workflow installs the pinned Compact toolchain, compiles the contract and executes the simulator + real PLONK checker suites.

Contract source and implementation notes live in [`contracts/midnight/`](contracts/midnight/).

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

See `.ai-build/` for the product contract, architecture, acceptance criteria, and operating guardrails.

## Roadmap

- **V0.1** — bounded fraud-decision vertical slice ✅
- **V0.2** — real Midnight Compact / PLONK funding predicate ✅
- **V0.3** — live/on-demand proving adapter + Midnight network deployment
- **V0.4** — attested KYC, tenure and compromise predicates + richer fraud-event integration

---

**Trust shouldn't require surrendering all your information.**
