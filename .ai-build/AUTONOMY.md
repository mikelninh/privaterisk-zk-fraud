# AUTONOMY — PrivateRisk V0.7

## Allowed without human approval
- ingest synthetic/test payment events
- request the minimum configured evidence
- verify signatures and proof receipts
- compute a deterministic risk score
- return `APPROVE`, `CHALLENGE`, or `REVIEW` as a pilot recommendation
- generate and replay decision receipts
- append pilot audit records
- calculate operational metrics
- probe read-only network health

## Requires an explicit external authority or human action
- moving, freezing, declining, refunding or reversing real money
- changing a customer account
- changing production fraud thresholds/policies
- accessing raw customer PII beyond the defined claim interfaces
- deploying to production banking infrastructure
- rotating issuer keys or changing issuer authority
- claiming a Midnight chain write without finalised chain identifiers

## Fail-closed rules
1. Missing critical claim -> `REVIEW`.
2. Failed critical claim -> `REVIEW`.
3. Local/control-plane policy disagreement -> runtime failure -> review path.
4. Replay mismatch -> runtime failure -> investigation.
5. Network health probe without write receipt -> never labelled as deployed.

## Authority model
AI/orchestration may decide what evidence to request. Cryptographic verification establishes whether evidence is valid. Deterministic policy owns the pilot decision. Human/regulated systems retain authority over consequential customer actions.
