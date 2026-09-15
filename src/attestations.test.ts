import { describe, expect, it } from 'vitest';
import { createFraudEvent } from './eventEnvelope';
import { createDemoAttestorEnvironment } from './demoAttestors';
import { verifyAttestation, AttestationVerificationError } from './attestations';

const tx = {
  amount: 15_000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

describe('PrivateRisk authorised attestations', () => {
  it('verifies three signed claims against the runtime issuer registry', async () => {
    const event = createFraudEvent(tx);
    const environment = await createDemoAttestorEnvironment();
    const signed = await environment.issueForEvent(event);

    const verified = await Promise.all(signed.map((attestation) => verifyAttestation(attestation, environment.registry, {
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
    })));

    expect(verified.map((item) => item.claim).sort()).toEqual([
      'ACCOUNT_AGE_GT_365',
      'KYC_VALID',
      'NO_ACTIVE_COMPROMISE',
    ]);
    expect(verified.every((item) => item.value)).toBe(true);
  });

  it('rejects a tampered attestation', async () => {
    const event = createFraudEvent(tx);
    const environment = await createDemoAttestorEnvironment();
    const [signed] = await environment.issueForEvent(event);
    const tampered = {
      ...signed,
      body: { ...signed.body, value: false },
    };

    await expect(verifyAttestation(tampered, environment.registry, {
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
    })).rejects.toMatchObject({ code: 'BAD_SIGNATURE' });
  });

  it('rejects expired evidence before policy consumption', async () => {
    const event = createFraudEvent(tx);
    const environment = await createDemoAttestorEnvironment();
    const issuedAt = new Date('2026-09-15T08:00:00.000Z');
    const [signed] = await environment.issueForEvent(event, issuedAt);

    await expect(verifyAttestation(signed, environment.registry, {
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
      now: new Date('2026-09-15T08:06:00.000Z'),
    })).rejects.toMatchObject({ code: 'EXPIRED' } satisfies Partial<AttestationVerificationError>);
  });

  it('rejects an issuer/key pair that is not in the registry', async () => {
    const event = createFraudEvent(tx);
    const environment = await createDemoAttestorEnvironment();
    const [signed] = await environment.issueForEvent(event);

    await expect(verifyAttestation(signed, [], {
      subjectId: event.payload.subjectId,
      eventId: event.eventId,
    })).rejects.toMatchObject({ code: 'UNKNOWN_ISSUER' });
  });
});
