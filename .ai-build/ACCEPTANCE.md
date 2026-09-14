# ACCEPTANCE — V0.2

## Product vertical slice
- [x] Canonical €15k / new-device / new-recipient scenario exists.
- [x] Evidence Planner requests trust claims.
- [x] Privacy Guardian blocks at least one over-broad raw-data request.
- [x] Fraud scorer returns a transparent risk score.
- [x] Deterministic policy returns CHALLENGE for canonical scenario.
- [x] Step-up authentication can move the final state to APPROVED.
- [x] Decision trace identifies the actor responsible for each step.
- [x] Human-readable explanation is shown.

## Privacy
- [x] Raw fields disclosed metric is zero in canonical browser scenario.
- [x] No real PII or financial data is present.
- [x] Browser clearly distinguishes synthetic provider attestations from the real ZK-backed predicate.
- [x] Raw synthetic balance is a private Compact witness and is not stored in public ledger state.

## Midnight / ZK
- [x] Real Compact circuit implemented for `BALANCE_GT_TRANSFER`.
- [x] Public transfer threshold is bound into the circuit.
- [x] Request ID is bound into the circuit and recorded after success.
- [x] Insufficient private balance is rejected.
- [x] Reusing a successful request ID is rejected.
- [x] Compact compilation runs without `--skip-zk`.
- [x] PLONK proving/verifying keys and ZKIR are generated.
- [x] Proof data is serialized and accepted by `@midnight-ntwrk/zkir-v2` for the €27k / €15k canonical proof.
- [x] Generated proof artifacts are preserved as a short-lived CI artifact.

## Safety / authority
- [x] Agent cannot directly approve/decline/freeze funds.
- [x] Proof truth is not LLM-judged.
- [x] Policy result is constrained and deterministic.
- [x] High-risk failed claims route to REVIEW.
- [x] UI does not falsely claim live browser proving or network deployment.

## Engineering / ship
- [x] Core web policy test passes.
- [x] Midnight simulator suite passes.
- [x] Real PLONK checker test passes.
- [x] Production web build passes.
- [x] GitHub Actions CI is green.
- [x] GitHub Pages deployment succeeds.
- [x] Public demo: https://mikelninh.github.io/privaterisk-zk-fraud/

## Explicitly deferred to V0.3+
- [ ] live/on-demand proof generation from the product runtime
- [ ] Midnight Preprod/Mainnet deployment
- [ ] expiry/time freshness beyond request-ID replay protection
- [ ] authorised external attestors for KYC / account tenure / compromise status
- [ ] production key custody and identity binding

## Demo success condition
A viewer should understand within 60 seconds:
1. why the transaction looks risky,
2. what evidence was requested,
3. what raw-data request was blocked,
4. which predicate is backed by a real Midnight/PLONK proof,
5. which remaining claims are synthetic provider attestations,
6. who actually has decision authority,
7. why the outcome is CHALLENGE,
8. that zero raw private fields are disclosed by the browser decision flow.
