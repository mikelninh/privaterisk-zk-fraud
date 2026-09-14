# ACCEPTANCE — V0.1

## Functional
- [x] Canonical €15k / new-device / new-recipient scenario exists.
- [x] Evidence Planner requests trust claims.
- [x] Privacy Guardian blocks at least one over-broad raw-data request.
- [x] Mock proof verifier validates predicate claims.
- [x] Fraud scorer returns a transparent risk score.
- [x] Deterministic policy returns CHALLENGE for canonical scenario.
- [x] Step-up authentication can move the final state to APPROVED.
- [x] Decision trace identifies the actor responsible for each step.
- [x] Human-readable explanation is shown.

## Privacy
- [x] Raw fields disclosed metric is zero in canonical scenario.
- [x] UI explicitly distinguishes verified claims from underlying private values.
- [x] No real PII or financial data is present.
- [ ] Real ZK proof path implemented (V0.2).

## Safety / authority
- [x] Agent cannot directly approve/decline/freeze funds.
- [x] Proof truth is not LLM-judged.
- [x] Policy result is constrained and deterministic.
- [x] High-risk failed claims route to REVIEW.

## Engineering
- [x] Core policy path has an automated test.
- [x] Architecture and authority boundaries documented.
- [ ] GitHub Actions build/test green.
- [ ] Public demo deployed.

## Demo success condition
A viewer should understand within 60 seconds:
1. why the transaction looks risky,
2. what evidence was requested,
3. what private request was blocked,
4. what was proven,
5. who actually had decision authority,
6. why the outcome was CHALLENGE,
7. that zero raw private fields were disclosed.
