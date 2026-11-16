// Capture real demo data, screenshots and a browser-generated PDF.
// Requires running Compose, Node 24 and devDependencies. Resets demo only.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const origin = 'http://localhost:3000',
  api = '/api/projects/demo';
async function post(path, body = {}, headers = {}) {
  const r = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, `${path}: HTTP ${r.status}`);
  const result = await r.json();
  if (path.startsWith('/proxy/')) assert.equal(result.errors, undefined);
  return result;
}
await post(api + '/reset');
await post(api + '/snapshots', { label: 'Исходное состояние' });
const scenarios = [];
for (const name of ['discover', 'traffic', 'blindspots', 'incident', 'recover', 'changes'])
  scenarios.push(await post(api + '/demo/' + name));
const capture = await post(api + '/captures', { label: 'Регрессия каталога · demo' });
for (const query of [
  'query CatalogCI {products{id name price sku}}',
  'query CustomersCI {users{id name email}}',
])
  await post('/proxy/demo/graphql', { query }, { 'x-innosight-capture': capture.token });
const captureReport = await post(api + '/captures/' + capture.id + '/finish');
assert.equal(captureReport.selectedFields, 9);
assert.equal(captureReport.errors, 0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('innosight-onboarded', '1');
  localStorage.setItem('innosight-theme', 'light');
});
await page.goto(origin + '/#/playground');
await page.getByRole('button', { name: 'Execute query', exact: true }).click();
await page.locator('.discovery-grid').waitFor();
await post(api + '/snapshots', { label: 'После тестов и демонстрации' });
await page.screenshot({
  path: new URL('../screenshots/playground.png', import.meta.url).pathname,
  fullPage: true,
});
await mkdir(new URL('../screenshots/', import.meta.url), { recursive: true });
for (const [route, file] of [
  ['overview', 'overview'],
  ['graph', 'graph-universe'],
  ['demo', 'demo-lab'],
  ['changes', 'change-impact'],
  ['tests', 'test-lab'],
  ['reports', 'reports'],
  ['captures', 'test-captures'],
]) {
  await page.goto(origin + '/#/' + route);
  await page.locator('main h1').waitFor();
  if (route === 'overview') await page.getByTestId('selection-coverage').waitFor();
  if (route === 'graph')
    await page.waitForFunction(() => document.querySelectorAll('.react-flow__minimap-node').length === 16);
  if (route === 'demo')
    await page.waitForFunction(() => document.querySelectorAll('.scenario-card.completed').length === 6);
  if (route === 'captures') {
    await page.getByTestId('capture-coverage').waitFor();
    await page.getByLabel('Поля прогона').selectOption('selected');
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(350);
  await page.screenshot({
    path: new URL('../screenshots/' + file + '.png', import.meta.url).pathname,
    fullPage: true,
  });
}
await page.goto(origin + '/#/overview');
await page.getByTestId('selection-coverage').waitFor();
await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
await page.waitForTimeout(200);
await page.screenshot({
  path: new URL('../screenshots/dashboard-dark.png', import.meta.url).pathname,
  fullPage: true,
});
await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
await page.setViewportSize({ width: 390, height: 900 });
await page.goto(origin + '/#/demo');
await page.locator('main h1').waitFor();
await page.screenshot({
  path: new URL('../screenshots/mobile-demo.png', import.meta.url).pathname,
  fullPage: true,
});
await page.goto(origin + '/#/captures');
await page.getByTestId('capture-coverage').waitFor();
await page.getByLabel('Поля прогона').selectOption('selected');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
await page.screenshot({
  path: new URL('../screenshots/mobile-captures.png', import.meta.url).pathname,
  fullPage: true,
});
const report = await browser.newPage();
const html = await report.goto(origin + api + '/report/html');
assert.equal(html.status(), 200);
await report.getByRole('heading', { name: 'Nexus Commerce', exact: true }).waitFor();
await report.pdf({
  path: new URL('../INNOSIGHT_SAMPLE_REPORT.pdf', import.meta.url).pathname,
  format: 'A4',
  printBackground: true,
});
const analytics = await (await fetch(origin + api + '/analytics')).json();
assert.equal(analytics.testRuns[0].failed, 0);
assert.equal(analytics.changes.length, 2);
assert.deepEqual(errors, []);
const evidence = {
  capturedAt: new Date().toISOString(),
  metrics: analytics.metrics,
  breakingChanges: analytics.changes.length,
  testRuns: analytics.testRuns.length,
  snapshots: analytics.snapshots.length,
  captureId: capture.id,
  scenarios: scenarios.map((s) => ({ name: s.scenario, before: s.before, after: s.after })),
  browserJavascriptErrors: errors,
  images: 'docs/screenshots',
  pdf: 'docs/INNOSIGHT_SAMPLE_REPORT.pdf',
};
await writeFile(new URL('./demo-capture.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
await browser.close();
console.log(JSON.stringify(evidence, null, 2));
