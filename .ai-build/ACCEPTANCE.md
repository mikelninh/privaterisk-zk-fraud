# ACCEPTANCE — V0.5

## Service boundary
- [x] External HTTP pilot API exists.
- [x] Issuer private keys are generated and retained server-side in external mode.
- [x] API exposes only signed attestations + public verification JWKs.
- [x] Browser imports public keys and verifies ES256 signatures itself.
- [x] Unknown issuer/key, unauthorised claim, wrong subject, wrong event, expiry and bad signature remain fail-closed conditions.
- [x] Evidence service is idempotent per event ID.

## Audit integrity
- [x] Decision records are appended server-side in external mode.
- [x] Each record includes previous hash + SHA-256 content hash.
- [x] Audit API exposes chain-integrity verification.
- [x] Duplicate decision idempotency keys return the original entry rather than duplicate it.
- [x] Self-test proves tampering is detected.
- [x] Browser smoke verifies a real server-side audit chain after the decision.

## Event / fraud policy
- [x] Kafka-compatible `payments.transaction.created` envelope remains explicit.
- [x] Policy receives verified predicates and provenance, never raw KYC / tenure / compromise source records.
- [x] `BALANCE_GT_TRANSFER` remains a required live Compact/PLONK predicate.
- [x] Missing critical evidence never silently becomes true.
- [x] Deterministic policy remains the action-authority boundary.
- [x] Step-up authentication remains separate from agent reasoning.

## Midnight / ZK
- [x] Real browser PLONK proving remains green.
- [x] Private synthetic balance stays inside the local proving boundary.
- [x] Public proof context remains bound to request ID, transfer threshold, policy version and expiry.
- [x] Preprod node/indexer endpoints are probed read-only through the pilot API.
- [x] UI clearly separates read reachability from write state.
- [x] Write state stays `NOT CONFIGURED`; no contract address or tx ID is invented.

## CI / evidence
- [x] Unit/regression tests run.
- [x] Pilot API self-test covers event idempotency, audit idempotency and hash-chain tamper detection.
- [x] Production bundle is built with the external API URL configured.
- [x] CI boots the pilot API and production Vite preview as separate processes.
- [x] Headless Chromium completes HTTP attestations → browser verification → PLONK proof → policy → server audit.
- [x] Browser smoke checks `WITHHELD`, `EXTERNAL HTTP`, `CHAIN VERIFIED`, signed issuer provenance and Preprod write truth boundary.

## Static demo truth boundary
- [x] GitHub Pages fallback is explicitly labelled `BROWSER FALLBACK` when no external API URL is configured.
- [x] Static fallback is not presented as the V0.5 external-service path.

## Explicitly deferred to V0.6 / production hardening
- [ ] real Midnight Preprod contract deployment and transaction submission
- [ ] verifiable Preprod contract address + transaction ID + confirmation/finality lifecycle
- [ ] deployed persistent pilot API reachable by the public demo
- [ ] HSM/KMS-backed issuer keys and rotation/revocation
- [ ] mTLS / workload identity / service-to-service authorisation
- [ ] durable database/event-store audit persistence across service restarts
- [ ] Kafka broker integration rather than event-envelope simulation
- [ ] HA, load, chaos, recovery and SLO validation
- [ ] threat model, penetration testing and supply-chain remediation
- [ ] GDPR/DPIA, legal/compliance and model-risk governance
- [ ] real fraud data, calibrated thresholds, drift monitoring and operational review workflows

## Demo success condition
A reviewer should understand within 60 seconds:
1. the payment event arrives in a production-shaped envelope,
2. raw customer source records are not required by policy,
3. external services sign only the needed predicates,
4. browser-side verification establishes attestation validity,
5. PLONK proves the balance predicate without exposing the balance to policy,
6. policy remains deterministic and fail-closed,
7. the decision is recorded in a tamper-evident audit chain,
8. Midnight Preprod is only probed read-only and no chain write is falsely claimed.
