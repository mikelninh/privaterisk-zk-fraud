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
  const reviewFailure = await page.getByText(/PROVER_|PREDICATE_FALSE|INTERNAL/).count();

  if (!withheld) throw new Error('Browser smoke failed: private balance boundary is not visible.');
  if (!notSubmitted) throw new Error('Browser smoke failed: network truth boundary is not visible.');
  if (reviewFailure > 0) throw new Error('Browser smoke failed: proof runtime rendered a failure state.');
  if (consoleErrors.length > 0) {
    throw new Error(`Browser smoke saw console/page errors: ${consoleErrors.join(' | ')}`);
  }

  console.log('PrivateRisk browser proof smoke: PASS');
} finally {
  await browser.close();
}
