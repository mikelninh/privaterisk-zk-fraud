# Midnight integration target — V0.2

V0.1 intentionally uses a mock verifier so the product, policy, and privacy semantics can be proven before blockchain complexity is introduced.

## Goal
Replace the mock verification boundary with real predicate proofs while keeping raw banking data off-chain.

## First proof family
A provider holds private source data and produces/verifies a proof that one of these predicates is true:

- `KYC_VALID`
- `ACCOUNT_AGE_GT_365`
- `NO_ACTIVE_COMPROMISE`
- `BALANCE_GT_TRANSFER`

The verifier should learn the predicate result and the authorised attestor/context required by policy, not the raw DOB, account opening date, compromise history, or balance.

## Proposed flow

```text
private provider data
       |
       v
Compact private input / attestation
       |
       v
local proof generation
       |
       v
proof + public predicate context
       |
       v
Midnight contract / ledger verification
       |
       v
PrivateRisk ProofVerifier adapter
       |
       v
fraud score + deterministic policy
```

## Engineering constraints
- Never write raw PII, balances, or complete transaction histories to the ledger.
- Bind proofs to explicit predicates and policy versions.
- Include freshness/expiry semantics.
- Include authorised-attestor semantics.
- Prevent replay where a proof must be transaction- or nonce-bound.
- Treat proof generation failure separately from a false predicate.
- Preserve audit correlation IDs without leaking customer identifiers.

## Spike acceptance
A synthetic balance of €27,000 can prove `balance >= €15,000` and the verifier cannot recover the raw €27,000 value from the public result.

See current Midnight developer documentation before implementing because Compact APIs and network tooling can evolve.
