# ACCEPTANCE — V0.3

## Product vertical slice
- [x] Canonical €15k / new-device / new-recipient scenario exists.
- [x] Evidence Planner requests trust claims.
- [x] Privacy Guardian replaces an over-broad raw-balance request with `BALANCE_GT_TRANSFER`.
- [x] Fraud scorer remains transparent.
- [x] Deterministic policy owns the action boundary and fails closed when required proof is unavailable.
- [x] Step-up authentication can move CHALLENGE to APPROVED.
- [x] Human-readable decision trace and explanation remain visible.

## Privacy
- [x] Synthetic balance is consumed only inside the local private proving boundary.
- [x] Fraud/policy layers receive only the verified predicate outcome, never the raw balance.
- [x] Raw balance is not rendered and is not written as public ledger state.
- [x] Browser UI explicitly distinguishes proof generation from network submission.

## Midnight / ZK
- [x] Compact circuit binds request ID, transfer threshold, policy version and expiry.
- [x] Replay protection is enforced.
- [x] Insufficient balance fails separately from prover/infrastructure failures.
- [x] Browser stages real proving/verifying keys, ZKIR and SRS slices.
- [x] `@midnight-ntwrk/zkir-v2` generates the PLONK proof on demand in a module worker.
- [x] Proof latency, proof size, correlation ID and proof digest are surfaced.
- [x] Existing real PLONK checker suite remains green.

## Reliability / authority
- [x] Proof timeout and freshness budget are explicit.
- [x] Retry behaviour is bounded.
- [x] `PREDICATE_FALSE`, `REPLAY`, `STALE`, `PROVER_TIMEOUT`, `PROVER_UNAVAILABLE` and internal failures are distinguished.
- [x] AI cannot decide whether a proof is valid.
- [x] AI cannot directly approve, decline or freeze funds.
- [x] Missing proof routes to REVIEW instead of being guessed.

## Engineering / ship
- [x] Core web tests pass.
- [x] Midnight simulator + PLONK checker suite passes.
- [x] Production Vite build passes with the real WASM proof worker.
- [x] Compiled proving assets are present in the production bundle.
- [x] Headless Chromium smoke test loads the production build, clicks `Evaluate + prove`, generates a live proof and observes `✓ PROOF GENERATED`.
- [x] Browser smoke verifies `WITHHELD` private-input UI and `NOT SUBMITTED` network truth boundary.
- [x] PR CI and Midnight Contract workflows are green.

## Explicitly deferred to production hardening / V0.4+
- [ ] Midnight Preprod/Mainnet contract submission and finality handling.
- [ ] production wallet/key custody and signer policy.
- [ ] authorised external attestors for KYC / account tenure / compromise status.
- [ ] revocation/status infrastructure for attestations.
- [ ] production-grade observability, alerting, SLOs and incident runbooks.
- [ ] durable audit/event storage with retention controls.
- [ ] threat model + penetration test + dependency/security remediation.
- [ ] privacy/DPIA, legal/compliance review and model-risk governance.
- [ ] real fraud data, calibrated thresholds, offline/online evaluation and drift monitoring.
- [ ] HA, load, chaos, recovery and regional-failure testing.

## V0.3 evidence
- Browser/prod CI run: `34947398290`
- Midnight Contract run: `34947398287`
- Evidence note: `evidence/V0.3_BROWSER_PROVING.md`

## Demo success condition
A viewer should understand within 60 seconds:
1. why the transaction is risky,
2. why the raw balance is unnecessary,
3. that the browser creates a fresh proof rather than replaying one,
4. that policy waits for verified cryptographic evidence,
5. that the raw private value is withheld from the decision layer,
6. that no Midnight network submission is claimed yet,
7. why the final financial action remains deterministic and bounded.
