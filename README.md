# PrivateRisk

**Agentic, privacy-preserving fraud decisioning.**

PrivateRisk explores a simple idea: financial trust should not require exposing all underlying financial data.

The first demo evaluates a high-value transfer from a new device. An evidence-planning agent requests only the minimum claims needed, a privacy guardian rejects over-broad requests, a proof-verifier boundary establishes claims, and a deterministic policy engine decides whether to approve, challenge, or review.

> North-star metric: **verified trust per unit of data disclosed**.

## V0.1 target

- €15,000 transfer, new device, new recipient
- AI-style evidence planning with bounded authority
- privacy guardian enforcing minimum-necessary disclosure
- proof-verifier abstraction (`MockProofVerifier` first, Midnight adapter next)
- deterministic fraud policy
- visual decision trace and audit explanation
- measurable privacy metrics

## Architecture principle

1. **Agent** — decides which evidence is useful.
2. **Cryptography** — proves whether claims are valid.
3. **Fraud scoring** — estimates risk.
4. **Policy** — determines allowed actions.
5. **Human** — remains in the loop for high-risk exceptions.

The LLM never directly freezes an account or approves a payment.

## Build OS

`01 SHAPE → 02 SPECIFY → 03 DELEGATE → 04 PROVE → 05 SHIP → 06 WATCH`

See `.ai-build/` for the living product and engineering specification.
