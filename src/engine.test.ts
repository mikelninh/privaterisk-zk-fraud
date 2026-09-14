import { describe, expect, it } from 'vitest';
import { evaluateTransaction } from './engine';

describe('PrivateRisk vertical slice', () => {
  it('challenges the synthetic high-value new-device transfer without disclosing raw fields', () => {
    const result = evaluateTransaction({
      amount: 15000,
      currency: 'EUR',
      newDevice: true,
      newRecipient: true,
    });

    expect(result.decision).toBe('CHALLENGE');
    expect(result.rawFieldsDisclosed).toBe(0);
    expect(result.disclosurePrevented).toBe(1);
    expect(result.claims.KYC_VALID).toBe(true);
    expect(result.claims.ACCOUNT_AGE_GT_365).toBe(true);
    expect(result.claims.NO_ACTIVE_COMPROMISE).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(0.55);
  });
});
