# SPEC — PrivateRisk V0.7 Operational Fraud Control Plane

## Problem
PrivateRisk can establish privacy-preserving trust claims and make a bounded fraud decision, but a bank team also needs to operate that decision safely: know which policy ran, reproduce it, distinguish missing evidence from negative evidence, prevent duplicate processing, and observe decision behaviour without pretending pilot data is production fraud ground truth.

## User story
As a fraud/data/technology team, I want every decision to produce a versioned, tamper-evident receipt that can be looked up, replayed and monitored, so that incidents, policy changes and integration failures are explainable rather than opaque.

## Canonical scenario
- payment event: €15,000
- new device: yes
- new recipient: yes
- three authorised ES256 trust attestations verify
- `BALANCE_GT_TRANSFER` is supplied by the Compact/PLONK proof path
- policy version: `privaterisk-policy-v0.7`
- expected decision: `CHALLENGE`
- raw private fields disclosed to policy: `0`

## Required behaviour
1. Keep the V0.1–V0.6 privacy and proof boundaries intact.
2. Accept a versioned payment event plus verified claims/provenance.
3. Evaluate deterministic V0.7 policy and issue a decision receipt.
4. Receipt contains a deterministic input hash, decision identity, policy version, reason code, risk score, claim snapshot, provenance and receipt hash.
5. Duplicate identical inputs return the same decision identity and do not double-count a new decision.
6. Missing critical evidence fails closed to `REVIEW`.
7. Failed critical evidence fails closed to `REVIEW`.
8. Canonical high-risk event with all critical evidence verified returns `CHALLENGE`.
9. Low-risk fully verified event can return `APPROVE`.
10. Every control-plane decision is linked to the tamper-evident audit chain.
11. A stored decision can be replayed under the same policy and must reproduce the same outcome.
12. Runtime detects local-policy vs control-plane disagreement and fails closed instead of silently choosing one.
13. Expose operational metrics: counts/rates by decision, reason codes, evidence failures, idempotent replays, replay mismatches and p50/p95 control-plane latency.
14. Metrics explicitly state that challenge/review rates are not fraud precision, recall or false-positive rate without labelled production outcomes.
15. Public HTTPS service exposes the V0.7 control-plane API while preserving the stable existing endpoint.
16. CI validates local policy, public control-plane behaviour, build/proving assets and browser integration.

## API
- `POST /v1/decisions` — evaluate + persist decision receipt/audit
- `GET /v1/decisions/:decisionId` — retrieve receipt
- `POST /v1/decisions/:decisionId/replay` — deterministic replay check
- `GET /v1/metrics` — operational decision telemetry
- existing `/v1/attestations`, `/v1/audit`, `/v1/network/preprod-health` remain compatible

## North-star metric
**Verified trust per unit of data disclosed.**

## Supporting operational metrics
- `APPROVE` / `CHALLENGE` / `REVIEW` counts and rates
- reason-code distribution
- missing-evidence count
- failed-critical-evidence count
- idempotent replay count
- replay mismatch count
- decision latency p50/p95
- raw fields disclosed

## Truth boundaries
- Synthetic events are not real bank traffic.
- Challenge/review rate is not a false-positive rate.
- The Edge Function's in-memory state is pilot-grade, not durable bank storage.
- Preprod node/indexer health is not proof of a write; a chain write is claimed only when the dedicated deployment evidence contains concrete finalised identifiers.
- No autonomous blocking, freezing or customer-impacting action is performed.

## Out of scope
- production fraud labels/model training
- HSM/KMS-backed issuer key custody
- mTLS/service identity
- durable multi-region storage and HA
- bank Kafka/payment integrations
- production SLOs/on-call automation
- autonomous decline/freeze actions
