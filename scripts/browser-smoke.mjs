import { chromium } from 'playwright';

const url = process.env.PRIVATERISK_SMOKE_URL ?? 'http://127.0.0.1:4173/privaterisk-zk-fraud/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByRole('button', { name: /evaluate \+ prove/i }).click();
  await page.getByText('✓ PROOF GENERATED', { exact: true }).waitFor({
    state: 'visible',
    timeout: 150_000,
  });

  const withheld = await page.getByText('WITHHELD', { exact: true }).isVisible();
  const notSubmitted = await page.getByText('NOT SUBMITTED', { exact: true }).isVisible();
  const attestationCount = await page.getByText(/3 \/ 3 VERIFIED/).count();
  const identityIssuer = await page.getByText(/Identity Lab · ES256/).count();
  const bankIssuer = await page.getByText(/Bank Core · ES256/).count();
  const fraudIssuer = await page.getByText(/Fraud Intelligence Provider · ES256/).count();
  const auditPersisted = await page.getByText(/record(?:s)? persisted/).count();
  const kafkaEnvelope = await page.getByText('Kafka-compatible envelope', { exact: true }).count();
  const reviewFailure = await page.getByText(/PROVER_|PREDICATE_FALSE|PILOT_RUNTIME_FAILURE|INTERNAL/).count();

  if (!withheld) throw new Error('Browser smoke failed: private balance boundary is not visible.');
  if (!notSubmitted) throw new Error('Browser smoke failed: network truth boundary is not visible.');
  if (attestationCount !== 1 || identityIssuer !== 1 || bankIssuer !== 1 || fraudIssuer !== 1) {
    throw new Error('Browser smoke failed: authorised signed attestations are not all visible.');
  }
  if (auditPersisted !== 1) throw new Error('Browser smoke failed: durable audit record is not visible.');
  if (kafkaEnvelope !== 1) throw new Error('Browser smoke failed: event-contract provenance is not visible.');
  if (reviewFailure > 0) throw new Error('Browser smoke failed: proof or pilot runtime rendered a failure state.');
  if (consoleErrors.length > 0) {
    throw new Error(`Browser smoke saw console/page errors: ${consoleErrors.join(' | ')}`);
  }

  // Confirm the audit survives a real browser refresh.
  await page.reload({ waitUntil: 'networkidle' });
  const storedAudit = await page.evaluate(() => localStorage.getItem('privaterisk.audit.v0.4'));
  if (!storedAudit || JSON.parse(storedAudit).length < 1) {
    throw new Error('Browser smoke failed: audit record did not survive refresh.');
  }

  console.log('PrivateRisk V0.4 browser pilot smoke: PASS');
} finally {
  await browser.close();
}
