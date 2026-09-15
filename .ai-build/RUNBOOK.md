# RUNBOOK — PrivateRisk V0.7

## Normal path
1. Receive `payments.transaction.created` event.
2. Obtain/verify authorised trust attestations.
3. Generate the local Compact/PLONK funding predicate.
4. Send only verified boolean claims + provenance to `POST /v1/decisions`.
5. Require local deterministic policy to agree with the control-plane receipt.
6. Replay the stored decision once in the pilot flow; require `matchesOriginal=true`.
7. Treat the linked hash-chain audit receipt as the pilot audit evidence.
8. Surface Preprod connectivity separately from chain-write state.

## Health checks
- Service: `GET /health`
- Metrics: `GET /v1/metrics`
- Audit integrity: `GET /v1/audit/verify`
- Midnight connectivity: `GET /v1/network/preprod-health`

## Failure handling
### Missing/failed evidence
Do not substitute guessed values. Policy returns `REVIEW`.

### Local vs remote policy mismatch
Browser throws `CONTROL_PLANE_MISMATCH`; UI falls into its existing fail-closed evidence failure path. Investigate policy-version drift before retrying.

### Replay mismatch
Browser throws `CONTROL_PLANE_REPLAY_MISMATCH`. Stop treating the service as deterministic; inspect policy/code/state changes.

### Public service unavailable
External mode must not silently claim remote verification. For development, `?localOnly=1` explicitly selects the browser fallback; this is labelled as demo/local evidence.

### Audit verification failure
Do not append a claim that the audit is valid. Preserve the failing chain for investigation and identify `brokenAt`.

### Midnight Preprod deployment blocked
Do not infer or fabricate a contract address/transaction ID. Inspect `evidence/V0.6_PREPROD_DEPLOYMENT.json` and the Actions artifact. If the wallet needs funding, use a persistent test wallet and the official Preprod funding flow; then rerun the dedicated deployment gate.

## Rollback
The public service retains the stable `privaterisk-v06` endpoint to avoid breaking the browser client. Supabase Edge Function versions can be inspected independently. If V0.7 decision endpoints regress, revert the Edge Function implementation and the V0.7 browser/client changes together; do not leave browser and policy versions split.

## Production hardening still required
HSM/KMS key custody, durable database/event storage, mTLS/service identity, bank event integration, SLOs/alerts, privacy/security review, change approval, labelled fraud outcomes and model/rule governance remain outside this pilot release.
