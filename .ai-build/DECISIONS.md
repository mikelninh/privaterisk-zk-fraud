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

## D-007 — V0.7 is an operational control plane, not another model
The next useful step is reproducibility and operability: versioned policy, deterministic receipts, replay, idempotency, metrics and audit linkage. Adding another opaque scorer would make the proof less useful to a fraud/data/technology team.

## D-008 — Calculate policy independently on both sides
The browser and public control plane calculate the same deterministic policy independently. A mismatch is a fault, not a tie to resolve. The runtime fails closed so policy-version drift cannot silently change a financial recommendation.

## D-009 — Missing evidence is different from false evidence
An unavailable claim is represented as missing and routes to `REVIEW / MISSING_CRITICAL_EVIDENCE`. A verified critical false claim routes to `REVIEW / FAILED_CRITICAL_EVIDENCE`. Neither is coerced to a guessed boolean.

## D-010 — Decision identity comes from canonical input
`inputHash` covers the versioned event, normalised claims and provenance. Identical canonical inputs map to the same decision identity. This gives deterministic idempotency and makes duplicate delivery/retries explicit.

## D-011 — Public idempotency must be durable
Edge-isolate memory is not a distributed idempotency store. V0.7 persists decisions, replay operations and audit state in Postgres. This was promoted from a production-hardening idea to a release requirement after the public smoke test demonstrated two consecutive HTTP requests can land on different isolate state.

## D-012 — Audit append is serialised in the database
The public tamper-evident chain is appended through a security-definer Postgres function protected by a transaction advisory lock. This prevents two concurrent writers from independently choosing the same predecessor/index.

## D-013 — Stable public URL, semantic version in health
The public Supabase function keeps the existing `privaterisk-v06` slug so older clients do not break. `/health` advertises implementation version `0.7.0` and `privaterisk-policy-v0.7`. URL naming is not treated as the semantic version contract.

## D-014 — Connectivity is not deployment truth
Midnight node/indexer/proof-server reachability is reported separately from chain-write state. A real deployment is claimed only when the dedicated deployment evidence contains finalised `contractAddress` and `transactionId` values.

## D-015 — Operational rates are not fraud-model quality metrics
Without labelled production outcomes, `APPROVE`, `CHALLENGE` and `REVIEW` rates are operational telemetry only. V0.7 explicitly refuses to label them as precision, recall or false-positive rate.
