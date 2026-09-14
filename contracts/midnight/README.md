# Midnight integration — V0.2

PrivateRisk V0.2 contains a **real Compact / PLONK proof path** for the first privacy-preserving fraud predicate.

## Proven predicate

A provider holds a private synthetic balance of **€27,000**. PrivateRisk needs to know only whether it can support a **€15,000** transfer.

```text
private balance = €27,000
        ↓ witness
Compact circuit
        ↓
assert balance >= public transfer threshold (€15,000)
        ↓
PLONK / ZKIR verification
        ↓
ACCEPTED
```

The verifier does not need the raw balance in public ledger state.

## Contract

`privaterisk.compact` exposes:

- private witness: `privateBalance(): Uint<64>`
- public/disclosed context: `requestId`, `transferAmount`
- ledger replay registry: `verifiedRequests`
- ledger metric: `proofCount`

The circuit succeeds only when the private balance satisfies the public threshold. A successful request ID is then recorded so the same request cannot be reused.

## Verification levels

### 1. Circuit-semantics simulator

`src/privaterisk.simulator.test.ts`

Proves:

- €27,000 / €15,000 → accepted
- €14,999 / €15,000 → rejected
- replayed request ID → rejected

### 2. Real PLONK checker

`src/privaterisk.plonk.test.ts`

The test executes the compiled circuit, serializes `proofData` with `proofDataIntoSerializedPreimage(...)`, then validates the proof using `@midnight-ntwrk/zkir-v2`.

The accepted CI run is documented in [`../../evidence/V0.2_MIDNIGHT_PLONK.md`](../../evidence/V0.2_MIDNIGHT_PLONK.md).

## Toolchain

- Compact compiler: `0.31.1`
- Compact language: `0.23`
- Compact runtime: `0.16.0`
- Midnight.js protocol: `4.1.1`
- ZKIR / PLONK checker: `@midnight-ntwrk/zkir-v2` `2.1.0`

Generated proving keys, verifier keys, ZKIR and compiled contract files are CI artifacts rather than committed source.

## Privacy and security constraints

- Never put raw PII, balances, transaction histories, or device histories on the ledger.
- Bind proofs to explicit policy context.
- Prevent replay with transaction/request-specific identifiers.
- Distinguish proof failure from business predicate failure in production adapters.
- Keep customer identifiers out of public correlation IDs.
- Add expiry/freshness policy above the current uniqueness protection before production use.
- Require authorised-attestor semantics before extending to external-provider claims.

## Current boundary

V0.2 proves the Compact → PLONK/ZKIR pipeline **for the tested synthetic input**. It does not yet claim:

- live browser proof generation,
- Midnight Preprod/Mainnet deployment,
- production KYC/AML attestations,
- production-safe key custody or identity binding.

Those belong to V0.3+.
