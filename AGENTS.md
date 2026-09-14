# AGENTS.md — PrivateRisk

## Mission
Build a credible, testable demonstration of agentic selective disclosure for fraud decisioning.

## Non-negotiable authority boundaries
- Agents may plan, retrieve, summarise, and recommend.
- Agents must not independently approve, decline, freeze, or release funds.
- Proof verification is deterministic/cryptographic, never LLM-judged.
- Policy decisions are deterministic and testable.
- High-risk exceptions remain human-reviewable.

## Product principle
**Ask for the minimum evidence needed to establish trust.** Prefer predicate claims over raw private values.

Bad: `send balance = €27,000`
Good: `prove balance >= €15,000`

## Build loop
01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH

Every feature must leave evidence in tests, evals, or the decision trace.

## Current milestone
V0.1 vertical slice:
1. Receive a synthetic €15k transfer from a new device to a new recipient.
2. Plan minimum evidence.
3. Block an unnecessary raw balance request.
4. Verify claims via a swappable proof-verifier boundary.
5. Compute risk.
6. Apply deterministic policy.
7. Require step-up authentication.
8. Produce a human-readable audit explanation.
9. Report raw fields disclosed = 0.

## Architecture direction
Keep `MockProofVerifier` behind an interface so a Midnight-backed verifier can replace it without changing fraud/policy semantics.

Do not add blockchain to paths that do not benefit from independent verification. Do not put raw transaction history or PII on-chain.
