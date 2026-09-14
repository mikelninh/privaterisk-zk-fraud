# ARCHITECTURE — PrivateRisk

## Design rule
Separate **reasoning**, **proof**, **prediction**, and **authority**.

```text
Transaction / Event
        |
        v
Evidence Planner (agentic reasoning)
        |
        v
Privacy Guardian (minimum necessary disclosure)
        |
        v
ProofVerifier interface
   |              |
   v              v
Mock V0.1      Midnight V0.2
        |
        v
Fraud Scorer (risk estimate)
        |
        v
Policy Engine (deterministic authority)
        |
   +----+-----+
   |          |
APPROVE   CHALLENGE / REVIEW
               |
               v
          Human / step-up
```

## Trust boundaries

### Evidence Planner
May infer which claims are useful from transaction context. It cannot assert that a claim is true and cannot execute money movement.

### Privacy Guardian
Checks whether a requested datum is necessary. Whenever policy can operate on a predicate, it should prefer a claim such as `BALANCE_GT_TRANSFER` over a raw balance.

### ProofVerifier
Stable interface between business logic and cryptographic implementation. V0.1 is explicitly a mock implementation. V0.2 should connect Compact/Midnight proof generation and verification without changing the downstream policy contract.

### Fraud Scorer
Produces a risk estimate. It is not the final authority. V0.1 is intentionally transparent and deterministic; a future model may replace it behind the same interface.

### Policy Engine
Owns action authority. Inputs are verified claims plus risk signals. Outputs are a constrained enum: APPROVE, CHALLENGE, REVIEW.

## On-chain / off-chain boundary
Keep PII, raw balances, complete transaction histories, device histories, and model features off-chain. Use the chain only where independent proof verification or auditable state materially improves the system.

## Midnight integration direction
Midnight's developer model supports selective disclosure and zero-knowledge proofs with Compact smart contracts and TypeScript DApp integration. PrivateRisk should use this for predicate proofs, not as a database for banking data.

Target first circuit/predicate set:
- KYC status is valid according to an authorised attestor.
- account age exceeds threshold.
- no active compromise flag exists according to an authorised fraud-data provider.
- balance/funding exceeds transaction threshold without revealing the raw balance.

## Event-driven direction
V0.2+ can introduce an event gateway (Kafka-compatible abstraction): transaction.received → evidence.requested → proof.verified → risk.scored → decision.made → challenge.completed.

Idempotency, correlation IDs, replay safety, schema evolution, and observability become acceptance requirements once asynchronous processing is introduced.
