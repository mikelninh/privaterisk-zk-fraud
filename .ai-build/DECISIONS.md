# DECISIONS

## D-001 — Product before chain complexity
V0.1 uses a mock proof verifier. We first prove that the product interaction, privacy semantics, policy boundary, and demo narrative are valuable. Midnight integration begins only behind the existing verifier contract.

## D-002 — No raw banking data on-chain
PII, balances, full transaction histories, device histories, and model features stay off-chain. Only minimal proof/public context should cross the cryptographic boundary.

## D-003 — LLMs do not own financial action authority
Agents may plan evidence, summarise traces, and recommend. Deterministic policy owns `APPROVE | CHALLENGE | REVIEW`. High-risk exceptions remain human-reviewable.

## D-004 — Predicate-first privacy
Prefer `balance >= threshold` to a raw balance, `age >= 18` to DOB, and `account_age > 365` to account opening date whenever the business decision only requires the predicate.

## D-005 — Transparent V0.1 risk scoring
The first scorer is deliberately simple and inspectable. This prevents the demo from hiding core behaviour behind a black-box model. A future ML scorer can replace it behind a stable interface.

## D-006 — Challenge beats unnecessary decline
The canonical scenario is suspicious but not proven fraudulent. Passing verified trust claims should result in `CHALLENGE`, not automatic decline. This demonstrates the fraud/customer-friction trade-off.
