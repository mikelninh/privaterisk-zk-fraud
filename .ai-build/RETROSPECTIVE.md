# RETROSPECTIVE — PrivateRisk V0.7

## What changed
V0.7 moved PrivateRisk from “a privacy-preserving fraud decision demo” to an **operable decision system**:

- deterministic/versioned policy
- decision identity + input hash + receipt hash
- explicit reason codes
- fail-closed missing/failed evidence
- idempotent duplicate handling
- deterministic replay
- decision/audit linkage
- operational metrics and latency
- browser vs control-plane policy parity checks
- durable public decision/idempotency/audit persistence in Postgres

## What the build caught

### 1. Idempotency means identical canonical input
The first local eval accidentally recreated the same logical event with a different `occurredAt`. The different envelope correctly produced a different input hash/decision identity. The test was fixed to replay the exact same event object.

**Lesson:** define idempotency at the event-envelope boundary, not by vague business similarity.

### 2. Edge-isolate memory is not durable distributed state
The first public V0.7 implementation stored decisions in Edge Function process memory. The public smoke sent the same request twice and received `idempotentReplay=false` on the second call because requests can hit different isolate state.

**Fix:** decisions, replay operations and audit records were moved to Postgres. Decision uniqueness is enforced by `input_hash`; a race falls back to the existing row. Audit append is serialised in Postgres with a transaction advisory lock.

**Lesson:** idempotency is a storage/consistency property, not a `Map` in application memory.

### 3. Replay internals must stay internal
The local implementation initially risked returning the stored `_request` replay payload on an idempotent response.

**Fix:** public receipt projection explicitly strips replay internals.

**Lesson:** operational reproducibility should not enlarge the external disclosure surface.

### 4. Local and remote policy should disagree loudly
Rather than making the remote service silently authoritative, the browser independently evaluates the deterministic policy and checks the control-plane result. Drift throws a fail-closed error.

**Lesson:** duplicated deterministic calculation can be useful as a deployment/versioning invariant when the cost is small and disagreement is safety-relevant.

### 5. Network reachability is not a chain write
The V0.6 Preprod work successfully reaches the node, indexer, proof server and faucet health endpoint. The deployment wallet is now constructed with the correct Midnight.js 4.1.1 protocol key objects. The actual tNIGHT drip request returns HTTP 403, and no finalised chain identifiers exist.

**Lesson:** connectivity evidence, funding evidence and transaction-finality evidence are different proof levels and must not be collapsed into one green badge.

## What remains external / intentionally deferred
The V0.7 operational control plane can be released independently as a stacked change. The inherited V0.6 real Midnight Preprod deployment still requires a **persistent funded test wallet** through the official funding path before the dedicated truth gate can produce a concrete contract address and transaction ID.

Production hardening still includes HSM/KMS key custody, workload identity/mTLS, real bank Kafka/payment integration, HA/SLO/on-call validation, security/compliance review, dependency remediation and labelled fraud outcomes.

## Best next technical step after V0.7
Introduce a real event broker/data-contract boundary and a controlled policy rollout model (shadow → canary → champion/challenger), while keeping the V0.7 receipt/replay contract stable.
