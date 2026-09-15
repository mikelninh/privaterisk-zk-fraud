# ACCEPTANCE — V0.4

## Product vertical slice
- [x] Canonical €15k / new-device / new-recipient scenario exists.
- [x] A Kafka-compatible `payments.transaction.created` envelope carries event id, key, schema version and transaction id.
- [x] Evidence Planner requests minimum trust claims.
- [x] Privacy Guardian replaces raw-balance disclosure with `BALANCE_GT_TRANSFER`.
- [x] Deterministic fraud policy owns the final action boundary.
- [x] Step-up authentication can move CHALLENGE to APPROVED.

## Authorised attestations
- [x] `KYC_VALID` is carried as an ES256-signed attestation.
- [x] `ACCOUNT_AGE_GT_365` is carried as an ES256-signed attestation.
- [x] `NO_ACTIVE_COMPROMISE` is carried as an ES256-signed attestation.
- [x] Issuer registry enforces issuer + key-id trust.
- [x] Issuer registry restricts which claims each issuer may sign.
- [x] Attestations are bound to subject + transaction event.
- [x] Expired attestations fail verification.
- [x] Tampered attestations fail signature verification.
- [x] Unknown issuer/key pairs fail verification.
- [x] Demo issuer private keys are ephemeral/non-exportable and are not committed to the repository.

## Midnight / ZK
- [x] V0.3 Compact/PLONK browser proof remains required for `BALANCE_GT_TRANSFER`.
- [x] Request id, transfer threshold, policy version and expiry remain bound into the proof context.
- [x] Replay/freshness/timeout failure semantics remain explicit.
- [x] Policy receives the proof predicate rather than the private balance.
- [x] UI continues to show `WITHHELD` for the private balance.

## Evidence provenance / authority
- [x] Fraud engine distinguishes `signed-attestation` from `midnight-proof` evidence.
- [x] Missing/invalid critical evidence is explicitly false and fails closed to REVIEW.
- [x] AI does not verify signatures or cryptographic proofs.
- [x] AI cannot directly approve, decline or freeze funds.
- [x] Human-readable trace identifies which boundary established each fact.

## Durable pilot audit
- [x] Pilot audit record contains event/transaction ids, correlation id, policy version, decision and risk score.
- [x] Audit record contains evidence provenance/digests and proof latency.
- [x] Raw-fields-disclosed metric is recorded.
- [x] Browser audit store persists across refreshes.
- [x] Storage boundary is explicit and replaceable; browser local storage is not represented as production-grade audit infrastructure.

## Network truth
- [x] Network adapter exposes explicit local / Preprod submission / confirmation / finality states.
- [x] Submitted/confirmed/final state requires concrete contract address + transaction id.
- [x] UI says `NOT SUBMITTED` / `PREPROD_NOT_CONFIGURED` until real chain evidence exists.
- [x] Current official Preprod endpoints + deployment gate are documented in `docs/MIDNIGHT_PREPROD_RUNBOOK.md`.
- [ ] Real Midnight Preprod contract address recorded.
- [ ] Real Preprod transaction submitted and independently observed.
- [ ] Confirmation/finality lifecycle implemented against the network.

## Engineering / ship
- [x] Core fraud-policy tests pass.
- [x] Signed-attestation success/tamper/expiry/unknown-issuer tests pass.
- [x] Event, audit-store and network-truth tests pass.
- [x] Production Vite build passes with browser WASM prover.
- [x] Browser proof smoke generates a fresh PLONK proof.
- [x] V0.4 browser smoke explicitly asserts all three signed attestations + persistent audit record.
- [x] PR CI green on verified V0.4 implementation (`34950226655`).
- [ ] GitHub Pages V0.4 deployment green.

## Explicit production gaps
- [ ] real external KYC/bank/fraud attestor adapters.
- [ ] issuer onboarding, rotation, revocation and status infrastructure.
- [ ] production wallet/key custody and signer policy (HSM/KMS/MPC or equivalent).
- [ ] Kafka / payment-rail integration rather than the in-browser event adapter.
- [ ] production append-only audit/event store with retention and access controls.
- [ ] observability, alerting, SLOs and incident runbooks.
- [ ] threat model, penetration test and dependency/security remediation.
- [ ] privacy/DPIA, legal/compliance review and model-risk governance.
- [ ] real fraud data, calibrated thresholds, evaluation and drift monitoring.
- [ ] HA, load, chaos, recovery and regional-failure testing.

## V0.4 evidence
- Verified PR CI run: `34950226655`
- Evidence note: `evidence/V0.4_ATTESTATION_PILOT.md`
- Preprod gate: `docs/MIDNIGHT_PREPROD_RUNBOOK.md`

## Demo success condition
A viewer should understand within 60 seconds:
1. which payment event entered the system,
2. why the transaction is risky,
3. which three facts came from authorised signed issuers,
4. which fact came from live Compact/PLONK,
5. what private information was withheld,
6. who owns the final decision authority,
7. that the audit survives a refresh,
8. that Midnight Preprod submission is still explicitly not claimed.
