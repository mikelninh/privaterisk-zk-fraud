# EVALS — PrivateRisk V0.7

## Release gates

| Eval | Input | Expected |
| --- | --- | --- |
| Canonical suspicious transfer | €15k, new device, new recipient, all 4 claims verified | `CHALLENGE` / `ELEVATED_TRANSACTION_RISK` |
| Safe transfer | €85, known device, known recipient, all claims verified | `APPROVE` |
| Missing funding proof | canonical event without `BALANCE_GT_TRANSFER` | `REVIEW` / `MISSING_CRITICAL_EVIDENCE` |
| Compromise evidence fails | `NO_ACTIVE_COMPROMISE=false` | `REVIEW` / `FAILED_CRITICAL_EVIDENCE` |
| Duplicate decision | same canonical event + claims + provenance twice | same `decisionId`; second response idempotent; one new-decision metric |
| Replay | replay stored canonical receipt | `matchesOriginal=true` |
| Audit tamper | mutate a stored audit record | chain verification fails at mutated index |
| Public signatures | public Edge Function issues 3 claims | all 3 ES256 signatures verify against returned registry |
| Data minimisation | any decision | `rawFieldsDisclosed=0` |
| Policy parity | browser/local engine vs public control plane | same decision + risk score or browser fails closed |

## Operational assertions
- `GET /v1/metrics` reports policy version `privaterisk-policy-v0.7`.
- `replayMismatches` remains `0` in the release smoke test.
- Metrics expose p50/p95 latency only as operational latency.
- Challenge/review rates are never labelled as fraud precision, recall or false-positive rate.

## Network truth assertion
Midnight Preprod is a separate gate. A healthy node/indexer probe is only connectivity evidence. V0.6/V0.7 may claim a real chain deployment only when the deployment gate produces a finalised `contractAddress` and `transactionId`.

## Commands
```bash
npm test
npm run test:pilot-api
npm run test:public-service
npm run midnight:stage
npm run build
npm run smoke:browser
```
