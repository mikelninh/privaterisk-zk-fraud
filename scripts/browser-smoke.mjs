import { chromium } from 'playwright';

const url = process.env.PRIVATERISK_SMOKE_URL ?? 'http://127.0.0.1:4173/privaterisk-zk-fraud/';
const api = process.env.PRIVATERISK_PILOT_API_URL ?? 'http://127.0.0.1:8787';
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
  await page.getByText('✓ PROOF GENERATED', { exact: true }).waitFor({ state: 'visible', timeout: 150_000 });

  const withheld = await page.getByText('WITHHELD', { exact: true }).isVisible();
  const externalHttp = await page.getByText('EXTERNAL HTTP', { exact: true }).count();
  const chainVerified = await page.getByText('CHAIN VERIFIED', { exact: true }).count();
  const attestationCount = await page.getByText(/3 \/ 3 VERIFIED/).count();
  const identityIssuer = await page.getByText(/Identity Service · ES256/).count();
  const bankIssuer = await page.getByText(/Bank Core Service · ES256/).count();
  const fraudIssuer = await page.getByText(/Fraud Intelligence Service · ES256/).count();
  const preprodProbe = await page.getByText('07 / MIDNIGHT PREPROD PROBE', { exact: true }).count();
  const writeBoundary = await page.getByText(/WRITE STATE: NOT CONFIGURED/).count();
  const kafkaEnvelope = await page.getByText('Kafka-compatible envelope', { exact: true }).count();
  const reviewFailure = await page.getByText(/PROVER_|PREDICATE_FALSE|PILOT_RUNTIME_FAILURE|INTERNAL/).count();

  if (!withheld) throw new Error('Browser smoke failed: private balance boundary is not visible.');
  if (externalHttp < 1) throw new Error('Browser smoke failed: external HTTP trust boundary is not active.');
  if (chainVerified < 1) throw new Error('Browser smoke failed: server hash-chain audit is not verified.');
  if (attestationCount !== 1 || identityIssuer !== 1 || bankIssuer !== 1 || fraudIssuer !== 1) {
    throw new Error('Browser smoke failed: external signed attestations are not all visible.');
  }
  if (preprodProbe !== 1 || writeBoundary !== 1) {
    throw new Error('Browser smoke failed: Preprod read/write truth boundary is not visible.');
  }
  if (kafkaEnvelope !== 1) throw new Error('Browser smoke failed: event-contract provenance is not visible.');
  if (reviewFailure > 0) throw new Error('Browser smoke failed: proof or pilot runtime rendered a failure state.');
  if (consoleErrors.length > 0) throw new Error(`Browser smoke saw console/page errors: ${consoleErrors.join(' | ')}`);

  const integrityResponse = await page.request.get(`${api}/v1/audit/verify`);
  if (!integrityResponse.ok()) throw new Error(`Audit verification endpoint failed: HTTP ${integrityResponse.status()}`);
  const integrity = await integrityResponse.json();
  if (!integrity.valid || integrity.count < 1 || !integrity.headHash) {
    throw new Error(`Server audit chain invalid after browser decision: ${JSON.stringify(integrity)}`);
  }

  const healthResponse = await page.request.get(`${api}/health`);
  const health = await healthResponse.json();
  if (health.mode !== 'external-http' || health.version !== '0.5.0') {
    throw new Error(`Unexpected pilot API health response: ${JSON.stringify(health)}`);
  }

  console.log('PrivateRisk V0.5 external-service browser smoke: PASS');
} finally {
  await browser.close();
}
