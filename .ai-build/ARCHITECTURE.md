# ARCHITECTURE — PrivateRisk V0.7

## Design rule
Separate **reasoning**, **evidence**, **proof**, **prediction**, **policy**, **operations**, and **authority**.

```text
payments.transaction.created
          |
          v
Evidence Planner / Privacy Guardian
          |
     +----+------------------+
     |                       |
ES256 trust attestations   Compact/PLONK predicate
     |                       |
     +-----------+-----------+
                 v
         Browser verification
                 |
                 v
      Local deterministic policy
                 |
                 +----------------------+
                 |                      |
                 v                      v
       V0.7 Control Plane         mismatch => FAIL CLOSED
                 |
          +------+------+----------------+
          |             |                |
   Decision receipt   Audit chain     Metrics
          |             |                |
          +-------> deterministic replay |
                        |
                        v
              APPROVE / CHALLENGE / REVIEW
                        |
                        v
                  human / step-up
```

## V0.7 control plane
The control plane is deliberately not a second AI model. It is a deterministic operational boundary around the fraud decision.

For each input it creates:
- `inputHash` over the versioned event, normalised claims and provenance
- deterministic `decisionId`
- explicit `policyVersion`
- decision + reason code + risk score
- claim/provenance snapshot
- `receiptHash`
- decision latency
- linked hash-chain audit entry

An identical input is idempotent. A stored decision can be replayed from its original canonical input and compared against the original policy projection.

## Dual calculation as a safety check
The browser computes the policy outcome locally after verifying attestations/proof. The external control plane independently computes the same deterministic policy. A disagreement is treated as an integration/policy-version fault and fails closed rather than selecting an answer opportunistically.

## Public service
The existing stable Supabase Edge Function endpoint remains the public HTTP boundary. Its implementation advertises semantic version `0.7.0` and adds decision/replay/metrics routes while keeping V0.6 attestation, audit and network-health routes compatible.

The public Edge Function is still pilot infrastructure:
- issuer keys are process/isolate scoped, not HSM/KMS-backed
- decision/audit state is process/isolate memory, not durable storage
- no production SLO/HA claim is made

## Midnight boundary
Compact/PLONK remains the privacy proof path for `BALANCE_GT_TRANSFER`. Midnight Preprod connectivity remains separate from deployment truth. A node/indexer health check does not establish that a contract write happened. Only the dedicated Preprod deployment evidence may supply a real contract address and transaction identifier.

## Authority
- reasoning layer: may request evidence
- cryptography: may establish evidence validity
- fraud scorer: may estimate risk
- deterministic policy: may recommend `APPROVE`, `CHALLENGE`, `REVIEW`
- control plane: may record/replay/monitor that recommendation
- human/bank systems: retain authority for consequential customer or money movement actions

## Production direction after V0.7
Durable event/audit storage, Kafka integration, HSM/KMS key custody, service identity/mTLS, schema registry/data contracts, SLOs/alerts, labelled fraud outcomes, champion/challenger rule/model governance and controlled policy rollout.
