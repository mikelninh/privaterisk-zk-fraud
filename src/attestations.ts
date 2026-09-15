import type { ClaimKey } from './engine';

export type AttestedClaimKey = Exclude<ClaimKey, 'BALANCE_GT_TRANSFER'>;

export type AttestationBody = {
  version: 'privaterisk-attestation-v1';
  issuer: string;
  keyId: string;
  subjectId: string;
  eventId: string;
  claim: AttestedClaimKey;
  value: boolean;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export type SignedAttestation = {
  alg: 'ES256';
  body: AttestationBody;
  signature: string;
};

export type IssuerRegistryEntry = {
  issuer: string;
  keyId: string;
  displayName: string;
  publicKey: CryptoKey;
  allowedClaims: AttestedClaimKey[];
};

export type VerifiedAttestation = {
  claim: AttestedClaimKey;
  value: boolean;
  issuer: string;
  displayName: string;
  keyId: string;
  subjectId: string;
  eventId: string;
  issuedAt: string;
  expiresAt: string;
  signatureDigest: string;
};

export class AttestationVerificationError extends Error {
  constructor(
    public readonly code:
      | 'UNKNOWN_ISSUER'
      | 'UNAUTHORISED_CLAIM'
      | 'SUBJECT_MISMATCH'
      | 'EVENT_MISMATCH'
      | 'EXPIRED'
      | 'BAD_SIGNATURE',
    message: string,
  ) {
    super(message);
    this.name = 'AttestationVerificationError';
  }
}

function encodeBody(body: AttestationBody): Uint8Array {
  // Tuple encoding gives us one stable canonical order for signing/verifying.
  return new TextEncoder().encode(JSON.stringify([
    body.version,
    body.issuer,
    body.keyId,
    body.subjectId,
    body.eventId,
    body.claim,
    body.value,
    body.issuedAt,
    body.expiresAt,
    body.nonce,
  ]));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digestHex(bytes: Uint8Array): Promise<string> {
  const copied = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copied.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signAttestation(body: AttestationBody, privateKey: CryptoKey): Promise<SignedAttestation> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encodeBody(body),
  );

  return {
    alg: 'ES256',
    body,
    signature: bytesToBase64Url(new Uint8Array(signature)),
  };
}

export async function verifyAttestation(
  attestation: SignedAttestation,
  registry: IssuerRegistryEntry[],
  context: { subjectId: string; eventId: string; now?: Date },
): Promise<VerifiedAttestation> {
  const entry = registry.find(
    (candidate) => candidate.issuer === attestation.body.issuer && candidate.keyId === attestation.body.keyId,
  );
  if (!entry) {
    throw new AttestationVerificationError('UNKNOWN_ISSUER', 'Attestation issuer or key id is not authorised.');
  }
  if (!entry.allowedClaims.includes(attestation.body.claim)) {
    throw new AttestationVerificationError(
      'UNAUTHORISED_CLAIM',
      `${entry.displayName} is not authorised to attest ${attestation.body.claim}.`,
    );
  }
  if (attestation.body.subjectId !== context.subjectId) {
    throw new AttestationVerificationError('SUBJECT_MISMATCH', 'Attestation subject does not match the transaction subject.');
  }
  if (attestation.body.eventId !== context.eventId) {
    throw new AttestationVerificationError('EVENT_MISMATCH', 'Attestation is bound to a different transaction event.');
  }

  const now = (context.now ?? new Date()).getTime();
  if (new Date(attestation.body.expiresAt).getTime() <= now) {
    throw new AttestationVerificationError('EXPIRED', 'Attestation expired before policy consumption.');
  }

  const signature = base64UrlToBytes(attestation.signature);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    entry.publicKey,
    signature,
    encodeBody(attestation.body),
  );
  if (!valid) {
    throw new AttestationVerificationError('BAD_SIGNATURE', 'Attestation signature verification failed.');
  }

  return {
    claim: attestation.body.claim,
    value: attestation.body.value,
    issuer: entry.issuer,
    displayName: entry.displayName,
    keyId: entry.keyId,
    subjectId: attestation.body.subjectId,
    eventId: attestation.body.eventId,
    issuedAt: attestation.body.issuedAt,
    expiresAt: attestation.body.expiresAt,
    signatureDigest: await digestHex(signature),
  };
}
