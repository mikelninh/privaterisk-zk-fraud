import { sha256Hex, stableStringify, validateEvent } from './core.mjs';

export const POLICY_VERSION = 'privaterisk-policy-v0.7';
export const DECISION_SCHEMA_VERSION = 'privaterisk-decision-receipt-v1';
export const REQUIRED_CLAIMS = [
  'KYC_VALID',
  'ACCOUNT_AGE_GT_365',
  'NO_ACTIVE_COMPROMISE',
  'BALANCE_GT_TRANSFER',
];

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function normaliseClaims(claims = {}) {
  return Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, typeof claims[claim] === 'boolean' ? claims[claim] : null]));
}

export function scoreOperationalRisk(event, claims) {
  const tx = event.payload;
  let score = 0.18;
  if (Number(tx.amount) >= 10_000) score += 0.28;
  if (tx.newDevice === true) score += 0.22;
  if (tx.newRecipient === true) score += 0.13;
  if (claims.NO_ACTIVE_COMPROMISE === false) score += 0.30;
  if (claims.KYC_VALID === false) score += 0.25;
  return Number(clamp(score, 0, 0.99).toFixed(2));
}

export function runPolicy(rawEvent, rawClaims) {
  const event = validateEvent(rawEvent);
  const claims = normaliseClaims(rawClaims);
  const missingClaims = REQUIRED_CLAIMS.filter((claim) => claims[claim] === null);
  const failedCriticalClaims = ['KYC_VALID', 'NO_ACTIVE_COMPROMISE', 'BALANCE_GT_TRANSFER'].filter((claim) => claims[claim] === false);
  const riskScore = scoreOperationalRisk(event, claims);

  let decision;
  let reasonCode;
  if (missingClaims.length > 0) {
    decision = 'REVIEW';
    reasonCode = 'MISSING_CRITICAL_EVIDENCE';
  } else if (failedCriticalClaims.length > 0) {
    decision = 'REVIEW';
    reasonCode = 'FAILED_CRITICAL_EVIDENCE';
  } else if (riskScore >= 0.55) {
    decision = 'CHALLENGE';
    reasonCode = 'ELEVATED_TRANSACTION_RISK';
  } else {
    decision = 'APPROVE';
    reasonCode = 'POLICY_REQUIREMENTS_SATISFIED';
  }

  return { policyVersion: POLICY_VERSION, decision, reasonCode, riskScore, claims, missingClaims, failedCriticalClaims };
}

function canonicalInput({ event, claims, provenance = {} }) {
  return {
    event: validateEvent(event),
    claims: normaliseClaims(claims),
    provenance: Object.fromEntries(REQUIRED_CLAIMS.map((claim) => [claim, provenance?.[claim] ?? null])),
  };
}

function updateMetrics(state, result, latencyMs) {
  state.controlMetrics.decisionsTotal += 1;
  state.controlMetrics.byDecision[result.decision] += 1;
  state.controlMetrics.byReason[result.reasonCode] = (state.controlMetrics.byReason[result.reasonCode] ?? 0) + 1;
  state.controlMetrics.missingEvidence += result.missingClaims.length;
  state.controlMetrics.failedCriticalEvidence += result.failedCriticalClaims.length;
  state.controlMetrics.latenciesMs.push(latencyMs);
  if (state.controlMetrics.latenciesMs.length > 500) state.controlMetrics.latenciesMs.shift();
}

export function initialiseControlPlane(state) {
  if (!state.decisionsById) state.decisionsById = new Map();
  if (!state.controlMetrics) {
    state.controlMetrics = {
      decisionsTotal: 0,
      idempotentReplays: 0,
      explicitReplays: 0,
      replayMismatches: 0,
      missingEvidence: 0,
      failedCriticalEvidence: 0,
      byDecision: { APPROVE: 0, CHALLENGE: 0, REVIEW: 0 },
      byReason: {},
      latenciesMs: [],
    };
  }
  return state;
}

export function evaluateDecision(state, request) {
  initialiseControlPlane(state);
  const started = performance.now();
  const input = canonicalInput(request);
  const inputHash = sha256Hex(input);
  const decisionId = `decision_${inputHash.slice(0, 24)}`;
  const existing = state.decisionsById.get(decisionId);
  if (existing) {
    state.controlMetrics.idempotentReplays += 1;
    const { _request, ...publicReceipt } = existing;
    return { ...structuredClone(publicReceipt), idempotentReplay: true };
  }

  const result = runPolicy(input.event, input.claims);
  const evaluatedAt = new Date().toISOString();
  const decisionCore = {
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionId,
    inputHash,
    eventId: input.event.eventId,
    transactionId: input.event.payload.transactionId,
    subjectId: input.event.payload.subjectId,
    evaluatedAt,
    policyVersion: result.policyVersion,
    decision: result.decision,
    reasonCode: result.reasonCode,
    riskScore: result.riskScore,
    claims: result.claims,
    provenance: input.provenance,
    missingClaims: result.missingClaims,
    failedCriticalClaims: result.failedCriticalClaims,
    rawFieldsDisclosed: 0,
  };
  const receipt = { ...decisionCore, receiptHash: sha256Hex(decisionCore), idempotentReplay: false };
  const latencyMs = Number((performance.now() - started).toFixed(2));
  receipt.decisionLatencyMs = latencyMs;
  state.decisionsById.set(decisionId, { ...receipt, _request: structuredClone(input) });
  updateMetrics(state, result, latencyMs);
  return structuredClone(receipt);
}

export function getDecision(state, decisionId) {
  initialiseControlPlane(state);
  const stored = state.decisionsById.get(decisionId);
  if (!stored) return null;
  const { _request, ...publicReceipt } = stored;
  return structuredClone(publicReceipt);
}

export function replayDecision(state, decisionId) {
  initialiseControlPlane(state);
  const stored = state.decisionsById.get(decisionId);
  if (!stored) return null;
  state.controlMetrics.explicitReplays += 1;
  const result = runPolicy(stored._request.event, stored._request.claims);
  const replayProjection = {
    policyVersion: result.policyVersion,
    decision: result.decision,
    reasonCode: result.reasonCode,
    riskScore: result.riskScore,
    claims: result.claims,
    missingClaims: result.missingClaims,
    failedCriticalClaims: result.failedCriticalClaims,
  };
  const originalProjection = {
    policyVersion: stored.policyVersion,
    decision: stored.decision,
    reasonCode: stored.reasonCode,
    riskScore: stored.riskScore,
    claims: stored.claims,
    missingClaims: stored.missingClaims,
    failedCriticalClaims: stored.failedCriticalClaims,
  };
  const matchesOriginal = stableStringify(replayProjection) === stableStringify(originalProjection);
  if (!matchesOriginal) state.controlMetrics.replayMismatches += 1;
  return { decisionId, replayedAt: new Date().toISOString(), policyVersion: POLICY_VERSION, matchesOriginal, original: originalProjection, replay: replayProjection };
}

export function controlMetrics(state) {
  initialiseControlPlane(state);
  const m = state.controlMetrics;
  const total = m.decisionsTotal;
  return {
    policyVersion: POLICY_VERSION,
    decisionsTotal: total,
    byDecision: { ...m.byDecision },
    byReason: { ...m.byReason },
    challengeRate: total ? Number((m.byDecision.CHALLENGE / total).toFixed(4)) : 0,
    reviewRate: total ? Number((m.byDecision.REVIEW / total).toFixed(4)) : 0,
    approveRate: total ? Number((m.byDecision.APPROVE / total).toFixed(4)) : 0,
    missingEvidence: m.missingEvidence,
    failedCriticalEvidence: m.failedCriticalEvidence,
    idempotentReplays: m.idempotentReplays,
    explicitReplays: m.explicitReplays,
    replayMismatches: m.replayMismatches,
    latencyMs: { samples: m.latenciesMs.length, p50: percentile(m.latenciesMs, 50), p95: percentile(m.latenciesMs, 95) },
    truthBoundary: 'Challenge/review rates are operational decision metrics, not fraud precision, recall, or false-positive rate because no production ground-truth labels are present.',
  };
}
