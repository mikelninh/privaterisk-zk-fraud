# SPEC — PrivateRisk V0.1

## Problem
Fraud and financial-risk workflows often gather more private data than a decision actually requires. PrivateRisk tests whether a system can establish enough trust to make a bounded fraud decision while minimising disclosure.

## User story
As a fraud operations or risk team, I want to evaluate a suspicious high-value transfer using only the minimum verified claims required by policy, so that I can reduce unnecessary exposure of sensitive customer data without weakening controls.

## Canonical scenario
- Amount: €15,000
- New device: yes
- New recipient: yes
- KYC on file: yes
- Account age: 920 days
- Active compromise: no
- Available balance: €27,000 (private; raw value must not be disclosed)

## Required behaviour
1. Ingest transaction context.
2. Evidence Planner determines needed claims.
3. Privacy Guardian rejects unnecessary raw-data requests and substitutes predicates where possible.
4. Proof verifier validates claims.
5. Fraud scorer estimates risk.
6. Deterministic policy chooses APPROVE, CHALLENGE, or REVIEW.
7. Canonical scenario must return CHALLENGE.
8. Successful step-up authentication changes final outcome to APPROVED.
9. UI provides a trace explaining each boundary.
10. UI displays privacy metrics, including raw fields disclosed.

## Claims
- `KYC_VALID`
- `ACCOUNT_AGE_GT_365`
- `NO_ACTIVE_COMPROMISE`
- `BALANCE_GT_TRANSFER`

## North-star metric
**Verified trust per unit of data disclosed.**

Supporting metrics:
- raw private fields disclosed
- over-broad requests blocked
- claims successfully verified
- risk score
- decision/challenge rate
- decision latency (future)

## Out of scope for V0.1
- real bank connectivity
- real customer data
- autonomous account freezing
- production fraud model
- production identity verification
- raw PII or transaction history on-chain
- claims that the mock verifier provides cryptographic privacy

## V0.2 candidate
Replace the mock proof-verifier implementation with a real Midnight/Compact proof path while preserving the same claim and policy interfaces.
