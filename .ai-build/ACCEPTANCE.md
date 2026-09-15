# ACCEPTANCE — PrivateRisk V0.7

## Operational control plane
- [x] `privaterisk-policy-v0.7` is explicit and versioned.
- [x] `POST /v1/decisions` returns a deterministic decision receipt.
- [x] Receipt binds event, transaction, subject, claims, provenance, policy, reason code and risk score.
- [x] Receipt includes deterministic `inputHash`, `decisionId` and `receiptHash`.
- [x] Identical decision inputs are idempotent and return the existing decision identity.
- [x] Missing critical evidence returns `REVIEW / MISSING_CRITICAL_EVIDENCE`.
- [x] Failed critical evidence returns `REVIEW / FAILED_CRITICAL_EVIDENCE`.
- [x] Canonical €15k/new-device/new-recipient scenario returns `CHALLENGE`.
- [x] Fully verified low-risk scenario can return `APPROVE`.

## Replay / policy safety
- [x] `POST /v1/decisions/:id/replay` reconstructs the policy result from stored canonical input.
- [x] Release eval requires `matchesOriginal=true`.
- [x] Browser independently calculates the policy result and compares it with the remote control plane.
- [x] Local/remote policy disagreement fails closed with `CONTROL_PLANE_MISMATCH`.
- [x] Replay disagreement fails closed with `CONTROL_PLANE_REPLAY_MISMATCH`.
- [x] Internal replay input is not returned in public decision receipts.

## Durable public state
- [x] Public decision/idempotency state is persisted in Postgres rather than Edge-isolate memory.
- [x] Public replay operations are persisted for operational metrics.
- [x] Public audit records are persisted in Postgres.
- [x] Audit appends are serialised with a Postgres advisory transaction lock.
- [x] Audit append is idempotent by key.
- [x] Database-side verification detects broken index / previous-hash / content-hash continuity.
- [x] Anonymous/authenticated database roles have no direct table access; Edge service role owns the storage boundary.

## Trust / privacy boundary
- [x] Existing ES256 attestation path remains intact.
- [x] Issuer private keys are not returned to the client.
- [x] Browser verifies signed claims against public JWKs.
- [x] `BALANCE_GT_TRANSFER` remains the Compact/PLONK predicate boundary.
- [x] Control-plane policy sees verified predicates/provenance, not raw balance/KYC source records.
- [x] Decision receipt reports `rawFieldsDisclosed=0` for the canonical scenario.

## Observability
- [x] `GET /v1/metrics` exposes decision counts/rates, reason codes, evidence failures, idempotent replays, replay mismatches and p50/p95 decision latency.
- [x] Metrics explicitly state that challenge/review rate is not fraud precision, recall or false-positive rate without labelled production outcomes.
- [x] Metrics are derived from durable public decision/operation rows.

## CI / evidence
- [x] Core unit/regression tests remain part of CI.
- [x] Local V0.7 control-plane eval covers CHALLENGE, APPROVE, missing evidence, failed evidence, idempotency, replay, metrics and audit tamper detection.
- [x] Public HTTPS smoke exercises signed evidence → decision receipt → duplicate idempotency → receipt lookup → replay → fail-closed case → metrics → audit → Preprod probe.
- [x] Compact contract compiles and browser proving assets are staged/asserted.
- [x] Production browser smoke runs against a real local HTTP control plane.

## Midnight Preprod truth boundary
- [x] Node, indexer and proof-server connectivity are independently verifiable.
- [x] V0.6 deployment code now constructs the Midnight.js 4.1.1 wallet provider with the correct protocol key objects.
- [x] Automated machine faucet failure is recorded as an external blocker rather than hidden.
- [x] No contract address or transaction ID is fabricated.
- [ ] Real Preprod write is finalised with concrete `contractAddress` + `transactionId`.

The unchecked item above is an inherited **external V0.6 deployment gate**, not a V0.7 control-plane acceptance failure. The current Preprod machine faucet returns HTTP 403 and the official public-network funding path requires a persistent funded test wallet.

## Still production hardening, not claimed by V0.7
- [ ] HSM/KMS-backed issuer key custody and rotation
- [ ] mTLS/workload identity
- [ ] real bank Kafka/payment integration
- [ ] production HA/SLO/on-call validation
- [ ] threat model / penetration test / dependency remediation
- [ ] GDPR/DPIA, legal/compliance and model-risk governance
- [ ] labelled production fraud outcomes and calibrated model/rule performance
- [ ] autonomous customer-impacting decline/freeze actions
