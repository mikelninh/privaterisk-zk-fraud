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
    ? 'Evidence + PLONK proving…'
    : proofStatus === 'verified'
      ? 'Pilot evidence verified'
      : proofStatus === 'failed'
        ? 'Evidence unavailable'
        : 'Pilot runtime ready';

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brandmark">PR</div>
        <div>
          <div className="eyebrow">PRIVATERISK / V0.4</div>
          <div className="brand-title">Agentic ZK Fraud Decisioning</div>
        </div>
        <div className={`status-pill ${proofStatus}`}><span /> {statusText}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">SIGNED ATTESTATIONS · LIVE ZK · DETERMINISTIC POLICY</p>
          <h1>Verify the facts.<br /><em>Minimise the disclosure.</em></h1>
          <p className="hero-copy">
            A Kafka-compatible payment event triggers an evidence plan. Authorised issuers sign KYC, account-tenure and compromise claims. Compact/PLONK proves funding sufficiency. Policy receives verified predicates — not the underlying private records.
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
          <div className="panel-kicker">V0.4 / PILOT EVIDENCE FABRIC</div>
          <h2>Signed claims + private proof → one bounded decision.</h2>
          <p>
            Three ES256 attestations are verified against an authorised issuer registry and bound to this event + subject. Funding sufficiency is proven locally with Midnight Compact/PLONK. The network adapter remains explicit: no Preprod transaction is claimed until one actually exists.
          </p>
        </div>

        {proofStatus === 'idle' && (
          <div className="proof-idle">
            <span className="pulse-ring" />
            <strong>Ready to ingest a synthetic payment event.</strong>
            <small>Fresh issuer keys, attestations and PLONK proof are generated on demand.</small>
          </div>
        )}

        {proofStatus === 'proving' && (
          <div className="proof-progress">
            <div className="proof-spinner" />
            <div>
              <strong>Verifying issuer evidence + generating PLONK proof…</strong>
              <p>Private witness material stays inside the browser proving boundary; issuer source records stay outside policy.</p>
            </div>
          </div>
        )}

        {receipt && (
          <>
            <div className="receipt-grid">
              <div><span>CIRCUIT</span><strong>{receipt.circuit}</strong></div>
              <div><span>PUBLIC THRESHOLD</span><strong>€{receipt.transferAmount.toLocaleString()}</strong></div>
              <div className="private-cell"><span>PRIVATE BALANCE</span><strong>WITHHELD</strong></div>
              <div><span>PROVER</span><strong>Browser WASM</strong></div>
              <div><span>PROOF LATENCY</span><strong>{receipt.totalMs} ms</strong></div>
              <div className="accepted-cell"><span>LOCAL RESULT</span><strong>✓ PROOF GENERATED</strong></div>
            </div>
            <div className="proof-meta-grid">
              <div><span>Correlation</span><code>{receipt.correlationId}</code></div>
              <div><span>Policy</span><code>{receipt.policyVersion}</code></div>
              <div><span>Proof SHA-256</span><code>{receipt.proofSha256.slice(0, 20)}…</code></div>
              <div><span>Proof size</span><code>{receipt.proofBytes.toLocaleString()} bytes</code></div>
              <div><span>Attestations</span><code>{pilotRun?.attestations.length ?? 0} / 3 VERIFIED</code></div>
              <div><span>Network submit</span><code>NOT SUBMITTED</code></div>
            </div>
            <p className="truth-boundary">
              <strong>Truth boundary:</strong> local browser proving and signed-attestation verification are real. Demo issuer signing keys are ephemeral and non-exportable. This build does not claim Midnight Preprod/Mainnet settlement, real bank issuers, HSM custody or production fraud-model performance.
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
            <div><span className="dot ok" />Tenure claim required</div>
          </div>
          <button className="primary" disabled={proofStatus === 'proving'} onClick={evaluate}>
            {proofStatus === 'proving' ? 'Verifying evidence…' : ran ? 'Run fresh pilot event' : 'Evaluate + prove'}
          </button>
          <p className="microcopy">Synthetic event payload. No real PII or bank data. Raw balance and issuer source records are never passed into fraud policy.</p>
        </aside>

        <section className="trace-card panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">02 / DECISION TRACE</div>
              <h2>Who established what?</h2>
            </div>
            {ran && <div className={`decision ${finalDecision.toLowerCase()}`}>{finalDecision}</div>}
          </div>

          {!ran ? (
            <div className="empty-state">
              <div className="pulse-ring" />
              <p>Run the event to create signed evidence, generate a fresh proof and inspect the authority trace.</p>
            </div>
          ) : proofStatus === 'proving' ? (
            <div className="empty-state">
              <div className="proof-spinner" />
              <p>Policy is waiting. Missing evidence is never silently replaced by an AI guess.</p>
            </div>
          ) : proofStatus === 'failed' ? (
            <div className="trace-list">
              <div className="trace-row">
                <div className="trace-index blocked">E</div>
                <div>
                  <div className="trace-meta">Evidence Boundary</div>
                  <strong>Required evidence unavailable</strong>
                  <p>{proofFailure?.message ?? fatalError} The transaction is routed to human review.</p>
                </div>
              </div>
              <div className="trace-row">
                <div className="trace-index warn">P</div>
                <div>
                  <div className="trace-meta">Policy Engine</div>
                  <strong>REVIEW</strong>
                  <p>Fail-closed because every critical trust claim must reach VERIFIED state.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="trace-list">
              {result.trace.map((step, index) => (
                <div className="trace-row" key={`${step.actor}-${index}`}>
                  <div className={`trace-index ${step.status}`}>{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="trace-meta">{step.actor}</div>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                </div>
              ))}
              {result.decision === 'CHALLENGE' && !authenticated && (
                <div className="challenge-box">
                  <div>
                    <span className="panel-kicker">STEP-UP AUTHENTICATION</span>
                    <strong>Passkey / biometric confirmation required</strong>
                  </div>
                  <button onClick={() => setAuthenticated(true)}>Authenticate</button>
                </div>
              )}
              {authenticated && (
                <div className="success-banner">✓ Strong authentication passed · transaction approved</div>
              )}
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
              <div className="panel-kicker">04 / AUTHORISED ISSUERS</div>
              <h2>Signed trust claims</h2>
              <div className="attestation-list">
                {pilotRun.attestations.map((attestation) => (
                  <div className="attestation-row" key={`${attestation.issuer}-${attestation.claim}`}>
                    <span>✓</span>
                    <div>
                      <strong>{attestation.claim}</strong>
                      <small>{attestation.displayName} · ES256 · {attestation.signatureDigest.slice(0, 12)}…</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">05 / NETWORK TRUTH</div>
              <h2>{pilotRun.network.state}</h2>
              <p className="pilot-copy">{pilotRun.network.note}</p>
              <code className="endpoint-code">{pilotRun.network.target === 'local-only' ? 'PREPROD: NOT CONFIGURED' : pilotRun.network.transactionId}</code>
            </article>

            <article className="panel pilot-card">
              <div className="panel-kicker">06 / DURABLE AUDIT</div>
              <h2>{pilotRun.auditCount} record{pilotRun.auditCount === 1 ? '' : 's'} persisted</h2>
              <dl className="compact-dl">
                <div><dt>Audit ID</dt><dd>{pilotRun.audit.auditId.slice(0, 22)}…</dd></div>
                <div><dt>Decision</dt><dd>{pilotRun.audit.decision}</dd></div>
                <div><dt>Evidence</dt><dd>{pilotRun.audit.evidence.length} verified items</dd></div>
                <div><dt>Raw fields</dt><dd>{pilotRun.audit.rawFieldsDisclosed}</dd></div>
              </dl>
            </article>
          </section>

          <section className="metrics-grid">
            <div className="metric-card"><span>Risk score</span><strong>{result.riskScore.toFixed(2)}</strong><small>deterministic policy input</small></div>
            <div className="metric-card glow"><span>Raw fields disclosed</span><strong>{result.rawFieldsDisclosed}</strong><small>to decision/policy layer</small></div>
            <div className="metric-card"><span>Signed attestations</span><strong>{pilotRun.attestations.length}</strong><small>authorised issuer registry</small></div>
            <div className="metric-card"><span>PLONK proving</span><strong>{receipt.proveMs}</strong><small>milliseconds</small></div>
          </section>

          <section className="explain panel">
            <div>
              <div className="panel-kicker">07 / EXPLAINABILITY</div>
              <h2>Human-readable audit explanation</h2>
            </div>
            <p>{authenticated ? `${result.explanation} Strong authentication subsequently passed, so the transaction was approved.` : result.explanation}</p>
          </section>

          <section className="boundary panel">
            <div className="panel-kicker">AUTHORITY BOUNDARIES</div>
            <div className="boundary-grid">
              <div><span>AGENT</span><strong>Requests evidence</strong><p>Reasoning and orchestration only.</p></div>
              <div><span>ISSUERS + PROOF</span><strong>Establish facts</strong><p>Signed attestations + Compact/PLONK.</p></div>
              <div><span>RISK</span><strong>Estimates likelihood</strong><p>Statistical signal, never final authority.</p></div>
              <div><span>POLICY</span><strong>Permits actions</strong><p>Fail-closed deterministic control boundary.</p></div>
            </div>
          </section>
        </>
      )}

      <footer>
        <span>PrivateRisk V0.4</span>
        <span>Trust shouldn't require surrendering all your information.</span>
      </footer>
    </main>
  );
}
