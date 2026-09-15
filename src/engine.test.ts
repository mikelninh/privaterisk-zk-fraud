import { describe, expect, it } from 'vitest';
import { evaluateTransaction } from './engine';

const tx = {
  amount: 15000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

describe('PrivateRisk vertical slice', () => {
  it('challenges the high-value transfer only after funding sufficiency arrives through the proof boundary', () => {
    const result = evaluateTransaction(tx, { BALANCE_GT_TRANSFER: true });

    expect(result.decision).toBe('CHALLENGE');
    expect(result.rawFieldsDisclosed).toBe(0);
    expect(result.disclosurePrevented).toBe(1);
    expect(result.claims.KYC_VALID).toBe(true);
    expect(result.claims.ACCOUNT_AGE_GT_365).toBe(true);
    expect(result.claims.NO_ACTIVE_COMPROMISE).toBe(true);
    expect(result.claims.BALANCE_GT_TRANSFER).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(0.55);
  });

  it('routes to review when the live balance proof is absent', () => {
    const result = evaluateTransaction(tx);

    expect(result.claims.BALANCE_GT_TRANSFER).toBe(false);
    expect(result.decision).toBe('REVIEW');
  });
});
