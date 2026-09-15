import { useMemo, useState } from 'react';
import { evaluateTransaction } from './engine';
import { generateLiveBalanceProof, type LiveProofReceipt, type LiveProofFailure } from './liveProof';

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
  const [receipt, setReceipt] = useState<LiveProofReceipt | null>(null);
  const [proofFailure, setProofFailure] = useState<LiveProofFailure | null>(null);

  const result = useMemo(
    () => evaluateTransaction(tx, receipt?.accepted ? { BALANCE_GT_TRANSFER: true } : {}),
    [receipt],
  );

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
    setReceipt(null);
    setProofFailure(null);
    setProofStatus('proving');

    const proof = await generateLiveBalanceProof(tx.amount);
    if (proof.accepted) {
      setReceipt(proof);
      setProofStatus('verified');
    } else {
      setProofFailure(proof);
      setProofStatus('failed');
    }
  }

  const statusText = proofStatus === 'proving'
    ? 'PLONK proving…'
    : proofStatus === 'verified'
      ? 'Live proof generated'
      : proofStatus === 'failed'
        ? 'Proof unavailable'
        : 'Browser prover ready';

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brandmark">PR</div>
        <div>
          <div className="eyebrow">PRIVATERISK / V0.3</div>
          <div className="brand-title">Agentic ZK Fraud Decisioning</div>
        </div>
        <div className={`status-pill ${proofStatus}`}><span /> {statusText}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">AGENTIC SELECTIVE DISCLOSURE · LIVE ZK</p>
          <h1>Ask for proof.<br /><em>Not the private data.</em></h1>
          <p className="hero-copy">
            The evidence planner asks for the minimum facts required. The privacy guardian blocks the raw-balance request. V0.3 now generates the funding-sufficiency PLONK proof on demand in your browser before deterministic fraud policy can consume the claim.
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
          <div className="panel-kicker">V0.3 / ON-DEMAND MIDNIGHT PROVING</div>
          <h2>Private witness → live PLONK proof → policy input.</h2>
          <p>
            The synthetic balance stays inside Compact private state. The public proof context carries only the €15,000 threshold, a one-time request ID, policy version and expiry. Browser WASM proving is real; chain submission is deliberately not claimed yet.
          </p>
        </div>

        {proofStatus === 'idle' && (
          <div className="proof-idle">
            <span className="pulse-ring" />
            <strong>Ready to generate a fresh proof.</strong>
            <small>No proof receipt is replayed from CI in V0.3.</small>
          </div>
        )}

        {proofStatus === 'proving' && (
          <div className="proof-progress">
            <div className="proof-spinner" />
            <div>
              <strong>Generating PLONK proof locally…</strong>
              <p>Loading ZKIR + proving key + SRS parameters. Private balance remains inside the circuit witness.</p>
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
              <div><span>Attempts</span><code>{receipt.attempts}</code></div>
              <div><span>Network submit</span><code>NOT SUBMITTED</code></div>
            </div>
            <p className="truth-boundary">
              <strong>Truth boundary:</strong> proof generation and constraint checking happen live in-browser. This build does not claim Midnight Preprod/Mainnet settlement or network verification.
            </p>
          </>
        )}

        {proofFailure && (
          <div className="proof-failure">
            <strong>{proofFailure.code}</strong>
            <p>{proofFailure.message}</p>
            <small>Fail-closed: deterministic policy routes the transaction to REVIEW instead of guessing.</small>
          </div>
        )}
      </section>

      <section className="workspace">
        <aside className="scenario-card panel">
          <div className="panel-kicker">01 / TRANSACTION</div>
          <h2>High-value transfer</h2>
          <div className="amount">€15,000<span>.00</span></div>
          <div className="signal-grid">
            <div><span className="dot warn" />New device</div>
            <div><span className="dot warn" />New recipient</div>
            <div><span className="dot ok" />KYC on file</div>
            <div><span className="dot ok" />Established account</div>
          </div>
          <button className="primary" disabled={proofStatus === 'proving'} onClick={evaluate}>
            {proofStatus === 'proving' ? 'Generating proof…' : ran ? 'Run fresh proof' : 'Evaluate + prove'}
          </button>
          <p className="microcopy">Synthetic data only. The raw balance is never rendered, logged, or sent to the proof worker.</p>
        </aside>

        <section className="trace-card panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">02 / DECISION TRACE</div>
              <h2>Who is allowed to decide?</h2>
            </div>
            {ran && <div className={`decision ${finalDecision.toLowerCase()}`}>{finalDecision}</div>}
          </div>

          {!ran ? (
            <div className="empty-state">
              <div className="pulse-ring" />
              <p>Run the transaction to generate a fresh proof and inspect the full decision trace.</p>
            </div>
          ) : proofStatus === 'proving' ? (
            <div className="empty-state">
              <div className="proof-spinner" />
              <p>Policy is waiting. A missing cryptographic claim is never silently replaced by an AI guess.</p>
            </div>
          ) : proofStatus === 'failed' ? (
            <div className="trace-list">
              <div className="trace-row">
                <div className="trace-index blocked">ZK</div>
                <div>
                  <div className="trace-meta">Proof Boundary</div>
                  <strong>Funding sufficiency unavailable</strong>
                  <p>{proofFailure?.message} The transaction is routed to human review.</p>
                </div>
              </div>
              <div className="trace-row">
                <div className="trace-index warn">P</div>
                <div>
                  <div className="trace-meta">Policy Engine</div>
                  <strong>REVIEW</strong>
                  <p>Fail-closed because a required proof did not reach VERIFIED state.</p>
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

      {receipt && (
        <>
          <section className="metrics-grid">
            <div className="metric-card"><span>Risk score</span><strong>{result.riskScore.toFixed(2)}</strong><small>deterministic policy input</small></div>
            <div className="metric-card glow"><span>Raw fields disclosed</span><strong>{result.rawFieldsDisclosed}</strong><small>browser decision flow</small></div>
            <div className="metric-card"><span>Live ZK predicates</span><strong>1</strong><small>generated on demand</small></div>
            <div className="metric-card"><span>PLONK proving</span><strong>{receipt.proveMs}</strong><small>milliseconds</small></div>
          </section>

          <section className="explain panel">
            <div>
              <div className="panel-kicker">03 / EXPLAINABILITY</div>
              <h2>Human-readable audit explanation</h2>
            </div>
            <p>{authenticated ? `${result.explanation} Strong authentication subsequently passed, so the transaction was approved.` : result.explanation}</p>
          </section>

          <section className="boundary panel">
            <div className="panel-kicker">AUTHORITY BOUNDARIES</div>
            <div className="boundary-grid">
              <div><span>AGENT</span><strong>Requests evidence</strong><p>Reasoning and orchestration only.</p></div>
              <div><span>PROOF</span><strong>Establishes a fact</strong><p>Compact + PLONK; raw balance stays private.</p></div>
              <div><span>RISK</span><strong>Estimates likelihood</strong><p>Statistical signal, never final authority.</p></div>
              <div><span>POLICY</span><strong>Permits actions</strong><p>Fail-closed deterministic control boundary.</p></div>
            </div>
          </section>
        </>
      )}

      <footer>
        <span>PrivateRisk V0.3</span>
        <span>Trust shouldn't require surrendering all your information.</span>
      </footer>
    </main>
  );
}
