import type { FraudEventEnvelope } from './eventEnvelope';
import {
  signAttestation,
  type AttestationBody,
  type AttestedClaimKey,
  type IssuerRegistryEntry,
  type SignedAttestation,
} from './attestations';

type DemoIssuer = {
  issuer: string;
  keyId: string;
  displayName: string;
  allowedClaims: AttestedClaimKey[];
  privateKey: CryptoKey;
  publicKey: CryptoKey;
};

export type DemoAttestorEnvironment = {
  registry: IssuerRegistryEntry[];
  issueForEvent(event: FraudEventEnvelope, now?: Date): Promise<SignedAttestation[]>;
};

async function generateIssuer(
  issuer: string,
  displayName: string,
  allowedClaims: AttestedClaimKey[],
): Promise<DemoIssuer> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  );

  return {
    issuer,
    keyId: `${issuer}#ephemeral-es256`,
    displayName,
    allowedClaims,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

export async function createDemoAttestorEnvironment(): Promise<DemoAttestorEnvironment> {
  const [identity, bank, fraud] = await Promise.all([
    generateIssuer('did:privaterisk:identity-demo', 'Identity Lab', ['KYC_VALID']),
    generateIssuer('did:privaterisk:bank-demo', 'Bank Core', ['ACCOUNT_AGE_GT_365']),
    generateIssuer('did:privaterisk:fraud-demo', 'Fraud Intelligence Provider', ['NO_ACTIVE_COMPROMISE']),
  ]);

  const issuers = [identity, bank, fraud];
  const registry: IssuerRegistryEntry[] = issuers.map((issuer) => ({
    issuer: issuer.issuer,
    keyId: issuer.keyId,
    displayName: issuer.displayName,
    publicKey: issuer.publicKey,
    allowedClaims: issuer.allowedClaims,
  }));

  return {
    registry,
    async issueForEvent(event, now = new Date()) {
      const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
      const nonce = () => crypto.randomUUID();

      const bodies: Array<{ issuer: DemoIssuer; body: AttestationBody }> = [
        {
          issuer: identity,
          body: {
            version: 'privaterisk-attestation-v1',
            issuer: identity.issuer,
            keyId: identity.keyId,
            subjectId: event.payload.subjectId,
            eventId: event.eventId,
            claim: 'KYC_VALID',
            value: true,
            issuedAt: now.toISOString(),
            expiresAt,
            nonce: nonce(),
          },
        },
        {
          issuer: bank,
          body: {
            version: 'privaterisk-attestation-v1',
            issuer: bank.issuer,
            keyId: bank.keyId,
            subjectId: event.payload.subjectId,
            eventId: event.eventId,
            claim: 'ACCOUNT_AGE_GT_365',
            value: true,
            issuedAt: now.toISOString(),
            expiresAt,
            nonce: nonce(),
          },
        },
        {
          issuer: fraud,
          body: {
            version: 'privaterisk-attestation-v1',
            issuer: fraud.issuer,
            keyId: fraud.keyId,
            subjectId: event.payload.subjectId,
            eventId: event.eventId,
            claim: 'NO_ACTIVE_COMPROMISE',
            value: true,
            issuedAt: now.toISOString(),
            expiresAt,
            nonce: nonce(),
          },
        },
      ];

      return Promise.all(bodies.map(({ issuer, body }) => signAttestation(body, issuer.privateKey)));
    },
  };
}

// Production rule: issuer private keys must never be bundled into the client.
// V0.4 creates ephemeral, non-exportable demo signing keys at runtime so no
// reusable private key material is committed to the repository.
