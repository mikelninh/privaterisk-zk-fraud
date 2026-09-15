export type Decision = 'APPROVE' | 'CHALLENGE' | 'REVIEW';

export type Transaction = {
  amount: number;
  currency: 'EUR';
  newDevice: boolean;
  newRecipient: boolean;
};

export type ClaimKey =
  | 'KYC_VALID'
  | 'ACCOUNT_AGE_GT_365'
  | 'NO_ACTIVE_COMPROMISE'
  | 'BALANCE_GT_TRANSFER';

export type EvidenceRequest = {
  claim: ClaimKey;
  requestedRawField?: string;
  rationale: string;
};

export type TraceStep = {
  actor: string;
  title: string;
  detail: string;
  status: 'ok' | 'warn' | 'blocked' | 'info';
};

export type Evaluation = {
  decision: Decision;
  riskScore: number;
  claims: Record<ClaimKey, boolean>;
  rawFieldsDisclosed: number;
  disclosurePrevented: number;
  trace: TraceStep[];
  explanation: string;
};

export type VerifiedClaimInput = Partial<Record<ClaimKey, boolean>>;

// Synthetic provider-side data used by the browser demonstration only.
// BALANCE_GT_TRANSFER is deliberately excluded from this source in V0.3: it
// must arrive through the live Midnight proof boundary.
const syntheticPrivateData = {
  identity: { kyc: true },
  bank: { accountAgeDays: 920, activeCompromise: false },
};

export function planEvidence(tx: Transaction): EvidenceRequest[] {
  const requests: EvidenceRequest[] = [
    {
      claim: 'KYC_VALID',
      rationale: 'High-value transfer requires verified identity.',
    },
    {
      claim: 'ACCOUNT_AGE_GT_365',
      rationale: 'Account tenure is a trust signal without exposing account history.',
    },
    {
      claim: 'NO_ACTIVE_COMPROMISE',
      rationale: 'New-device activity should be checked against compromise status.',
    },
  ];

  if (tx.amount >= 10_000) {
    requests.push({
      claim: 'BALANCE_GT_TRANSFER',
      requestedRawField: 'bank.balance',
      rationale: 'The planner initially asks for balance context.',
    });
  }

  return requests;
}

export function privacyGuard(requests: EvidenceRequest[]): {
  approved: EvidenceRequest[];
  blockedRawRequests: number;
  trace: TraceStep[];
} {
  const trace: TraceStep[] = [];
  let blockedRawRequests = 0;

  const approved = requests.map((request) => {
    if (request.requestedRawField) {
      blockedRawRequests += 1;
      trace.push({
        actor: 'Privacy Guardian',
        title: 'Over-broad request blocked',
        detail: `${request.requestedRawField} was not disclosed. Replaced with proof ${request.claim}.`,
        status: 'blocked',
      });
      return { ...request, requestedRawField: undefined };
    }
    return request;
  });

  return { approved, blockedRawRequests, trace };
}

export function syntheticClaimValue(claim: ClaimKey): boolean {
  switch (claim) {
    case 'KYC_VALID':
      return syntheticPrivateData.identity.kyc;
    case 'ACCOUNT_AGE_GT_365':
      return syntheticPrivateData.bank.accountAgeDays > 365;
    case 'NO_ACTIVE_COMPROMISE':
      return !syntheticPrivateData.bank.activeCompromise;
    case 'BALANCE_GT_TRANSFER':
      return false;
  }
}

export function scoreRisk(tx: Transaction, claims: Record<ClaimKey, boolean>): number {
  let score = 0.18;
  if (tx.amount >= 10_000) score += 0.28;
  if (tx.newDevice) score += 0.22;
  if (tx.newRecipient) score += 0.13;
  if (!claims.NO_ACTIVE_COMPROMISE) score += 0.3;
  if (!claims.KYC_VALID) score += 0.25;
  return Math.min(0.99, Number(score.toFixed(2)));
}

export function applyPolicy(riskScore: number, claims: Record<ClaimKey, boolean>): Decision {
  if (!claims.KYC_VALID || !claims.NO_ACTIVE_COMPROMISE || !claims.BALANCE_GT_TRANSFER) return 'REVIEW';
  if (riskScore >= 0.55) return 'CHALLENGE';
  return 'APPROVE';
}

export function evaluateTransaction(
  tx: Transaction,
  verifiedClaims: VerifiedClaimInput = {},
): Evaluation {
  const trace: TraceStep[] = [
    {
      actor: 'Event Gateway',
      title: 'Transaction received',
      detail: `${tx.currency} ${tx.amount.toLocaleString('en-US')} · ${tx.newDevice ? 'new device' : 'known device'} · ${tx.newRecipient ? 'new recipient' : 'known recipient'}`,
      status: 'info',
    },
  ];

  const planned = planEvidence(tx);
  trace.push({
    actor: 'Evidence Planner',
    title: 'Minimum evidence plan created',
    detail: `${planned.length} claims requested based on transaction risk signals.`,
    status: 'info',
  });

  const guarded = privacyGuard(planned);
  trace.push(...guarded.trace);

  const claims = Object.fromEntries(
    guarded.approved.map((request) => {
      const value = request.claim in verifiedClaims
        ? Boolean(verifiedClaims[request.claim])
        : syntheticClaimValue(request.claim);
      return [request.claim, value];
    }),
  ) as Record<ClaimKey, boolean>;

  for (const [claim, value] of Object.entries(claims) as [ClaimKey, boolean][]) {
    const externallyVerified = claim in verifiedClaims;
    trace.push({
      actor: externallyVerified ? 'Live Midnight Proof' : 'Demo Evidence Provider',
      title: `${claim} ${value ? 'verified' : 'failed'}`,
      detail: externallyVerified
        ? value
          ? 'On-demand Compact/PLONK proof generated in the browser WASM prover. The raw balance never crossed the private-state boundary.'
          : 'The cryptographic predicate did not pass.'
        : value
          ? 'Synthetic provider attestation passed. This claim is intentionally labelled non-ZK in V0.3.'
          : claim === 'BALANCE_GT_TRANSFER'
            ? 'No live funding-sufficiency proof was supplied. Deterministic policy must not treat this as verified.'
            : 'Synthetic provider attestation failed.',
      status: value ? 'ok' : 'warn',
    });
  }

  const riskScore = scoreRisk(tx, claims);
  const decision = applyPolicy(riskScore, claims);

  trace.push({
    actor: 'Fraud Engine',
    title: `Risk score ${riskScore.toFixed(2)}`,
    detail: 'Risk combines transaction context with the available trust claims.',
    status: riskScore >= 0.55 ? 'warn' : 'ok',
  });
  trace.push({
    actor: 'Policy Engine',
    title: decision,
    detail:
      decision === 'CHALLENGE'
        ? 'Step-up authentication required before final approval.'
        : decision === 'REVIEW'
          ? 'Human review required because a critical trust claim is missing or failed.'
          : 'Transaction can proceed under current policy.',
    status: decision === 'APPROVE' ? 'ok' : 'warn',
  });

  return {
    decision,
    riskScore,
    claims,
    rawFieldsDisclosed: 0,
    disclosurePrevented: guarded.blockedRawRequests,
    trace,
    explanation:
      decision === 'CHALLENGE'
        ? 'The transfer is high-value, from a new device, and to a new recipient. Identity, account-tenure, and compromise checks are synthetic provider attestations; funding sufficiency arrived through the live Midnight Compact/PLONK proof boundary. Deterministic policy therefore requires step-up authentication rather than a decline.'
        : 'The decision follows deterministic policy over available trust claims and transaction risk signals.',
  };
}
