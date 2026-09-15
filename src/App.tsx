import { useState } from 'react';
import { evaluateTransaction } from './engine';
import { runPilotDecision, type PilotRun } from './pilot';

const tx = {
  amount: 15000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

type ProofStatus = 'idle' | 'proving' | 'verified' | 'failed';

export default function App() {
  const [ran, setRan] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [proofStatus, setProofStatus] = useState<ProofStatus>('idle');
  const [pilotRun, setPilotRun] = useState<PilotRun | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const receipt = pilotRun?.proof.accepted ? pilotRun.proof : null;
  const proofFailure = pilotRun && !pilotRun.proof.accepted ? pilotRun.proof : null;
  const result = pilotRun?.evaluation ?? evaluateTransaction(tx);

  const finalDecision = proofStatus === 'failed'
    ? 'REVIEW'
    : authenticated && result.decision === 'CHALLENGE'
      ? 'APPROVED'
      : proofStatus === 'verified'
        ? result.decision
        : 'PROVING';

  async function evaluate() {
    setRan(true);
    setAuthenticated(false);
    setPilotRun(null);
    setFatalError(null);
    setProofStatus('proving');

    try {
      const nextRun = await runPilotDecision(tx);
      setPilotRun(nextRun);
      setProofStatus(nextRun.proof.accepted ? 'verified' : 'failed');
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setProofStatus('failed');
    }
  }

  const statusText = proofStatus === 'proving'
    ? 'External evidence + PLONK…'
    : proofStatus === 'verified'
      ? 'Service-boundary decision verified'
      : proofStatus === 'failed'
        ? 'Evidence unavailable'
        : 'V0.5 runtime ready';

  const serviceMode = pilotRun?.serviceBoundary.mode === 'external-http' ? 'EXTERNAL HTTP' : 'BROWSER FALLBACK';
  const chainText = pilotRun?.auditChain.verified ? 'CHAIN VERIFIED' : 'LOCAL DEMO STORE';
  const probeReachable = Boolean(pilotRun?.preprodProbe?.node.reachable || pilotRun?.preprodProbe?.indexer.reachable);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brandmark">PR</div>
        <div>
          <div className="eyebrow">PRIVATERISK / V0.5</div>
          <div className="brand-title">Agentic Privacy-Preserving Fraud Infrastructure</div>
        </div>
        <div className={`status-pill ${proofStatus}`}><span /> {statusText}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">EXTERNAL TRUST · LIVE ZK · TAMPER-EVIDENT AUDIT</p>
          <h1>Trust the claim.<br /><em>Not a giant data dump.</em></h1>
          <p className="hero-copy">
            A payment event triggers the minimum evidence plan. External issuers sign only the facts policy needs, Compact/PLONK proves funding sufficiency, and the decision is written into a verifiable audit chain. AI orchestrates; cryptography and deterministic policy keep authority bounded.
          </p>
        </div>
        <div className="north-star">
          <span>NORTH-STAR METRIC</span>
          <strong>Verified trust</strong>
          <div className="metric-divider" />
          <strong>Data disclosed</strong>
        </div>
      </section>

      <section className={`zk-receipt panel proof-${proofStatus}`}>
        <div className="receipt-intro">
          <div>
            <div className="panel-kicker">V0.5 / SERVICE-BOUNDARY TRUST FABRIC</div>
            <h2>External signatures + private proof + hash-chain audit.</h2>
          </div>
          <p>
            In external mode, issuer private keys never enter the browser. The browser receives signed predicates plus public verification keys, validates them locally, generates the balance proof locally, and submits only decision metadata to the audit service. Midnight Preprod remains read-only until a real signer and transaction exist.
          </p>
        </div>

        {proofStatus === 'idle' && (
          <div className="proof-idle">
            <span className="pulse-ring" />
            <strong>Ready for a fresh service-boundary decision.</strong>
            <small>CI runs the production browser against the real local pilot API.</small>
          </div>
        )}

        {proofStatus === 'proving' && (
          <div className="proof-progress">
            <div className="proof-spinner" />
            <div>
              <strong>Requesting signed evidence + generating PLONK proof…</strong>
              <p>Policy waits until every required trust claim reaches a verified state.</p>
            </div>
          </div>
        )}

        {receipt && pilotRun && (
          <>
            <div className="receipt-grid">
              <div><span>CIRCUIT</span><strong>{receipt.circuit}</strong></div>
              <div><span>PUBLIC THRESHOLD</span><strong>€{receipt.transferAmount.toLocaleString()}</strong></div>
              <div className="private-cell"><span>PRIVATE BALANCE</span><strong>WITHHELD</strong></div>
              <div><span>TRUST BOUNDARY</span><strong>{serviceMode}</strong></div>
              <div><span>PROOF LATENCY</span><strong>{receipt.totalMs} ms</strong></div>
              <div className="accepted-cell"><span>LOCAL RESULT</span><strong>✓ PROOF GENERATED</strong></div>
            </div>
            <div className="proof-meta-grid">
              <div><span>Correlation</span><code>{receipt.correlationId}</code></div>
              <div><span>Signed claims</span><code>{pilotRun.attestations.length} / 3 VERIFIED</code></div>
              <div><span>Audit integrity</span><code>{chainText}</code></div>
              <div><span>Audit head</span><code>{pilotRun.auditChain.headHash ? `${pilotRun.auditChain.headHash.slice(0, 16)}…` : 'N/A'}</code></div>
              <div><span>Preprod probe</span><code>{pilotRun.preprodProbe ? (probeReachable ? 'REACHABLE' : 'UNREACHABLE') : 'NOT RUN'}</code></div>
              <div><span>Network write</span><code>NOT CONFIGURED</code></div>
            </div>
            <p className="truth-boundary">
              <strong>Truth boundary:</strong> {pilotRun.serviceBoundary.note} The PLONK proof is generated locally. The server audit chain is tamper-evident in pilot mode, but real bank production still requires HSM/KMS custody, mTLS/service identity, durable storage, HA/SLOs and security/compliance review.
            </p>
          </>
        )}

        {(proofFailure || fatalError) && (
          <div className="proof-failure">
            <strong>{proofFailure?.code ?? 'PILOT_RUNTIME_FAILURE'}</strong>
            <p>{proofFailure?.message ?? fatalError}</p>
            <small>Fail-closed: deterministic policy routes the transaction to REVIEW instead of guessing.</small>
          </div>
        )}
      </section>

      <section className="workspace">
        <aside className="scenario-card panel">
          <div className="panel-kicker">01 / PAYMENT EVENT</div>
          <h2>High-value transfer</h2>
          <div className="amount">€15,000<span>.00</span></div>
          <div className="signal-grid">
            <div><span className="dot warn" />New device</div>
            <div><span className="dot warn" />New recipient</div>
            <div><span className="dot ok" />KYC claim required</div>
            <div><span className="dot ok" />Compromise claim required</div>
          </div>
          <button className="primary" disabled={proofStatus === 'proving'} onClick={evaluate}>
            {proofStatus === 'proving' ? 'Verifying trust…' : ran ? 'Run fresh decision' : 'Evaluate + prove'}
          </button>
          <p className="microcopy">Synthetic event only. No real PII or bank data. In external mode, signing keys remain service-side.</p>
        </aside>

        <section className="trace-card panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">02 / DECISION TRACE</div>
              <h2>Who is allowed to establish what?</h2>
            </div>
            {ran && <div className={`decision ${finalDecision.toLowerCase()}`}>{finalDecision}</div>}
          </div>

          {!ran ? (
            <div className="empty-state"><div className="pulse-ring" /><p>Run the event to request signed evidence, generate a fresh proof and inspect the authority trace.</p></div>
          ) : proofStatus === 'proving' ? (
            <div className="empty-state"><div className="proof-spinner" /><p>Policy is waiting. Missing evidence is never silently replaced by an AI guess.</p></div>
          ) : proofStatus === 'failed' ? (
            <div className="trace-list">
              <div className="trace-row"><div className="trace-index blocked">E</div><div><div className="trace-meta">Evidence Boundary</div><strong>Required evidence unavailable</strong><p>{proofFailure?.message ?? fatalError}</p></div></div>
              <div className="trace-row"><div className="trace-index warn">P</div><div><div className="trace-meta">Policy Engine</div><strong>REVIEW</strong><p>Fail-closed because every critical trust claim must reach VERIFIED state.</p></div></div>
            </div>
          ) : (
            <div className="trace-list">
              {result.trace.map((step, index) => (
                <div className="trace-row" key={`${step.actor}-${index}`}>
                  <div className={`trace-index ${step.status}`}>{String(index + 1).padStart(2, '0')}</div>
                  <div><div className="trace-meta">{step.actor}</div><strong>{step.title}</strong><p>{step.detail}</p></div>
                </div>
              ))}
              {result.decision === 'CHALLENGE' && !authenticated && (
                <div className="challenge-box"><div><span className="panel-kicker">STEP-UP AUTHENTICATION</span><strong>Passkey / biometric confirmation required</strong></div><button onClick={() => setAuthenticated(true)}>Authenticate</button></div>
              )}
              {authenticated && <div className="success-banner">✓ Strong authentication passed · transaction approved</div>}
            </div>
          )}
        </section>
      </section>

      {pilotRun && receipt && (
        <>
          <section className="pilot-grid">
            <article className="panel pilot-card">
              <div className="panel-kicker">03 / EVENT CONTRACT</div>
              <h2>Kafka-compatible envelope</h2>
              <dl className="compact-dl">
                <div><dt>Topic</dt><dd>{pilotRun.event.topic}</dd></div>
                <div><dt>Key</dt><dd>{pilotRun.event.key}</dd></div>
                <div><dt>Schema</dt><dd>{pilotRun.event.schemaVersion}</dd></div>
                <div><dt>Event</dt><dd>{pilotRun.event.eventId.slice(0, 24)}…</dd></div>
              </dl>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">04 / EXTERNAL TRUST SERVICE</div>
              <h2>{serviceMode}</h2>
              <p className="pilot-copy">{pilotRun.serviceBoundary.note}</p>
              <code className="endpoint-code">{pilotRun.serviceBoundary.endpoint ?? 'NO EXTERNAL API CONFIGURED'}</code>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">05 / AUTHORISED ISSUERS</div>
              <h2>Signed trust claims</h2>
              <div className="attestation-list">
                {pilotRun.attestations.map((attestation) => (
                  <div className="attestation-row" key={`${attestation.issuer}-${attestation.claim}`}><span>✓</span><div><strong>{attestation.claim}</strong><small>{attestation.displayName} · ES256 · {attestation.signatureDigest.slice(0, 12)}…</small></div></div>
                ))}
              </div>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">06 / TAMPER-EVIDENT AUDIT</div>
              <h2>{chainText}</h2>
              <dl className="compact-dl">
                <div><dt>Records</dt><dd>{pilotRun.auditChain.count}</dd></div>
                <div><dt>Mode</dt><dd>{pilotRun.auditChain.mode}</dd></div>
                <div><dt>Decision</dt><dd>{pilotRun.audit.decision}</dd></div>
                <div><dt>Raw fields</dt><dd>{pilotRun.audit.rawFieldsDisclosed}</dd></div>
              </dl>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">07 / MIDNIGHT PREPROD PROBE</div>
              <h2>{pilotRun.preprodProbe ? (probeReachable ? 'READ PATH REACHABLE' : 'READ PATH UNREACHABLE') : 'NOT RUN'}</h2>
              <p className="pilot-copy">{pilotRun.preprodProbe?.note ?? 'External service required for the read-only Preprod probe.'}</p>
              <code className="endpoint-code">WRITE STATE: NOT CONFIGURED</code>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">08 / SERVICE AUDIT RECEIPT</div>
              <h2>{pilotRun.auditCount} record{pilotRun.auditCount === 1 ? '' : 's'}</h2>
              <dl className="compact-dl">
                <div><dt>Audit ID</dt><dd>{pilotRun.audit.auditId.slice(0, 22)}…</dd></div>
                <div><dt>Evidence</dt><dd>{pilotRun.audit.evidence.length} verified items</dd></div>
                <div><dt>Chain head</dt><dd>{pilotRun.auditChain.headHash ? `${pilotRun.auditChain.headHash.slice(0, 14)}…` : 'N/A'}</dd></div>
                <div><dt>Replay</dt><dd>{pilotRun.auditChain.idempotentReplay ? 'IDEMPOTENT' : 'FRESH'}</dd></div>
              </dl>
            </article>
          </section>

          <section className="metrics-grid">
            <div className="metric-card"><span>Risk score</span><strong>{result.riskScore.toFixed(2)}</strong><small>deterministic policy input</small></div>
            <div className="metric-card glow"><span>Raw fields disclosed</span><strong>{result.rawFieldsDisclosed}</strong><small>to decision/policy layer</small></div>
            <div className="metric-card"><span>Signed attestations</span><strong>{pilotRun.attestations.length}</strong><small>verified in browser</small></div>
            <div className="metric-card"><span>PLONK proving</span><strong>{receipt.proveMs}</strong><small>milliseconds</small></div>
          </section>

          <section className="explain panel"><div><div className="panel-kicker">09 / EXPLAINABILITY</div><h2>Human-readable audit explanation</h2></div><p>{authenticated ? `${result.explanation} Strong authentication subsequently passed, so the transaction was approved.` : result.explanation}</p></section>

          <section className="boundary panel">
            <div className="panel-kicker">AUTHORITY BOUNDARIES</div>
            <div className="boundary-grid">
              <div><span>AGENT</span><strong>Requests evidence</strong><p>Reasoning and orchestration only.</p></div>
              <div><span>TRUST SERVICES</span><strong>Sign predicates</strong><p>Private signing keys stay outside the browser in external mode.</p></div>
              <div><span>ZK PROVER</span><strong>Establishes funding fact</strong><p>Compact + PLONK, private witness local.</p></div>
              <div><span>POLICY</span><strong>Permits actions</strong><p>Fail-closed deterministic control boundary.</p></div>
            </div>
          </section>
        </>
      )}

      <footer><span>PrivateRisk V0.5</span><span>Trust shouldn't require surrendering all your information.</span></footer>
    </main>
  );
}
