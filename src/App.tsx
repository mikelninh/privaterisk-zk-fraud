import { useMemo, useState } from 'react';
import { evaluateTransaction } from './engine';

const tx = {
  amount: 15000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

export default function App() {
  const [ran, setRan] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const result = useMemo(() => evaluateTransaction(tx), []);

  const finalDecision = authenticated && result.decision === 'CHALLENGE' ? 'APPROVED' : result.decision;

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brandmark">PR</div>
        <div>
          <div className="eyebrow">PRIVATERISK / V0.1</div>
          <div className="brand-title">Agentic ZK Fraud Decisioning</div>
        </div>
        <div className="status-pill"><span /> Demo environment</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">VERIFIED TRUST · MINIMUM DISCLOSURE</p>
          <h1>Make a financial decision.<br /><em>Not a data grab.</em></h1>
          <p className="hero-copy">
            An evidence-planning agent asks for the minimum facts required. The privacy guardian blocks over-broad requests. Proofs establish claims. Deterministic policy decides.
          </p>
        </div>
        <div className="north-star">
          <span>NORTH-STAR METRIC</span>
          <strong>Verified trust</strong>
          <div className="metric-divider" />
          <strong>Data disclosed</strong>
        </div>
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
          <button className="primary" onClick={() => { setRan(true); setAuthenticated(false); }}>
            {ran ? 'Run again' : 'Evaluate transaction'}
          </button>
          <p className="microcopy">Synthetic data only. No personal financial information leaves the provider boundary.</p>
        </aside>

        <section className="trace-card panel">
          <div className="panel-heading">
            <div>
              <div className="panel-kicker">02 / DECISION TRACE</div>
              <h2>Why did the system decide?</h2>
            </div>
            {ran && <div className={`decision ${finalDecision.toLowerCase()}`}>{finalDecision}</div>}
          </div>

          {!ran ? (
            <div className="empty-state">
              <div className="pulse-ring" />
              <p>Run the transaction to inspect the full evidence and policy trace.</p>
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

      {ran && (
        <>
          <section className="metrics-grid">
            <div className="metric-card"><span>Risk score</span><strong>{result.riskScore.toFixed(2)}</strong><small>policy input</small></div>
            <div className="metric-card glow"><span>Raw fields disclosed</span><strong>{result.rawFieldsDisclosed}</strong><small>minimum disclosure</small></div>
            <div className="metric-card"><span>Claims verified</span><strong>{Object.values(result.claims).filter(Boolean).length}</strong><small>cryptographic boundary</small></div>
            <div className="metric-card"><span>Disclosure blocked</span><strong>{result.disclosurePrevented}</strong><small>privacy guardian</small></div>
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
              <div><span>PROOFS</span><strong>Establish facts</strong><p>No AI decides whether a proof is valid.</p></div>
              <div><span>RISK</span><strong>Estimates likelihood</strong><p>Statistical signal, not authority.</p></div>
              <div><span>POLICY</span><strong>Permits actions</strong><p>Deterministic control boundary.</p></div>
            </div>
          </section>
        </>
      )}

      <footer>
        <span>PrivateRisk</span>
        <span>Trust shouldn't require surrendering all your information.</span>
      </footer>
    </main>
  );
}
