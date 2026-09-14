import { useMemo, useState } from 'react';
import { evaluateTransaction } from './engine';

const tx = {
  amount: 15000,
  currency: 'EUR' as const,
  newDevice: true,
  newRecipient: true,
};

const plonkReceipt = {
  network: 'Midnight',
  compiler: 'Compact 0.31.1',
  runtime: '0.16.0',
  circuit: 'proveBalanceForTransfer',
  threshold: '€15,000',
  privateInput: 'WITHHELD',
  verifier: 'PLONK / ZKIR',
  status: 'ACCEPTED',
  run: '34906492162',
  runUrl: 'https://github.com/mikelninh/privaterisk-zk-fraud/actions/runs/34906492162',
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
          <div className="eyebrow">PRIVATERISK / V0.2</div>
          <div className="brand-title">Agentic ZK Fraud Decisioning</div>
        </div>
        <div className="status-pill verified"><span /> Midnight PLONK verified</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">VERIFIED TRUST · MINIMUM DISCLOSURE</p>
          <h1>Make a financial decision.<br /><em>Not a data grab.</em></h1>
          <p className="hero-copy">
            An evidence-planning agent asks for the minimum facts required. The privacy guardian blocks over-broad requests. A real Midnight Compact predicate proves funding sufficiency. Deterministic policy decides.
          </p>
        </div>
        <div className="north-star">
          <span>NORTH-STAR METRIC</span>
          <strong>Verified trust</strong>
          <div className="metric-divider" />
          <strong>Data disclosed</strong>
        </div>
      </section>

      <section className="zk-receipt panel">
        <div className="receipt-intro">
          <div className="panel-kicker">V0.2 / REAL ZK EVIDENCE</div>
          <h2>Private balance. Public threshold. Verifiable result.</h2>
          <p>
            The balance predicate is compiled from Compact with real PLONK proving/verifying keys and accepted by Midnight's ZKIR checker. The browser replays that verified outcome; it does not pretend to generate the proof live.
          </p>
        </div>
        <div className="receipt-grid">
          <div><span>CIRCUIT</span><strong>{plonkReceipt.circuit}</strong></div>
          <div><span>PUBLIC THRESHOLD</span><strong>{plonkReceipt.threshold}</strong></div>
          <div className="private-cell"><span>PRIVATE BALANCE</span><strong>{plonkReceipt.privateInput}</strong></div>
          <div><span>VERIFIER</span><strong>{plonkReceipt.verifier}</strong></div>
          <div><span>COMPACT</span><strong>{plonkReceipt.compiler}</strong></div>
          <div className="accepted-cell"><span>CHECKER VERDICT</span><strong>✓ {plonkReceipt.status}</strong></div>
        </div>
        <a className="evidence-link" href={plonkReceipt.runUrl} target="_blank" rel="noreferrer">
          Inspect verification run #{plonkReceipt.run} ↗
        </a>
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
              <div className="trace-row zk-trace-row">
                <div className="trace-index ok">ZK</div>
                <div>
                  <div className="trace-meta">Midnight / Compact / PLONK</div>
                  <strong>BALANCE_GT_TRANSFER cryptographically checked</strong>
                  <p>Real V0.2 checker evidence: the private witness satisfies the €15,000 public threshold. Raw balance remains outside public ledger state.</p>
                </div>
              </div>
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
            <div className="metric-card"><span>Claims verified</span><strong>{Object.values(result.claims).filter(Boolean).length}</strong><small>trust evidence</small></div>
            <div className="metric-card"><span>Real ZK predicates</span><strong>1</strong><small>Midnight PLONK verified</small></div>
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
              <div><span>PROOFS</span><strong>Establish facts</strong><p>Compact + PLONK verifies predicates; AI cannot override them.</p></div>
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
