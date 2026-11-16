// Reproducible release audit. Requires running Compose, Node 24 and devDependencies.
// Resets demo only; performs a real Compose down/up without removing volumes.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const origin = process.env.INNOSIGHT_URL || 'http://localhost:3000';
const api = '/api/projects/demo';
async function get(path) {
  const r = await fetch(origin + path);
  assert.equal(r.status, 200, path);
  return r.json();
}
async function post(path, body = {}, headers = {}) {
  const r = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  return r.json();
}
await post(api + '/reset');
const capture = await post(api + '/captures', { label: 'Release 1.1 restart audit' });
const captureHeader = { 'x-innosight-capture': capture.token };
await post('/proxy/demo/graphql', { query: 'query RuntimeUsers {users{id name}}' }, captureHeader);
await post(
  '/proxy/demo/graphql',
  { query: 'query RuntimeSuppliers {suppliers{rating leadTimeDays}}' },
  captureHeader,
);
await post('/proxy/demo/graphql', { query: 'query OutsideRuntime {products{price}}' });
const captured = await get(api + '/captures/' + capture.id);
assert.equal(captured.requests, 2);
assert.equal(captured.selectedFields, 6);
assert.equal(captured.totalFields, 99);
assert.equal(captured.selectedTypes, 3);
assert.equal(captured.totalTypes, 15);
assert.equal(captured.fields.find((f) => f.coordinate === 'Product.price').selected, false);
await post(api + '/snapshots', { label: 'Release 1.1 restart checkpoint' });
const before = await get(api + '/analytics');
assert.equal(before.metrics.verifiedCoverage, 0);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => localStorage.setItem('innosight-onboarded', '1'));
await page.goto(origin + '/#/overview');
await page.getByTestId('selection-coverage').waitFor();
await page.waitForFunction(() =>
  document.querySelector('[data-testid="selection-coverage"]')?.textContent?.includes('28,3'),
);
// Waiting for actual rendered data also establishes the live Dashboard before restart.
const beforeText = await page.getByTestId('selection-coverage').textContent();
const compose = ['compose', '-p', process.env.COMPOSE_PROJECT_NAME || 'innosight'];
try {
  execFileSync('docker', [...compose, 'down', '--timeout', '12'], { stdio: 'inherit' });
  execFileSync('docker', [...compose, 'up', '-d', '--no-build', '--wait'], { stdio: 'inherit' });
  const after = await get(api + '/analytics');
  const preserved = await get(api + '/captures/' + capture.id);
  assert.equal(after.metrics.requests, before.metrics.requests);
  assert.equal(after.schema.id, before.schema.id);
  assert.deepEqual(
    after.recent.map((r) => r.id),
    before.recent.map((r) => r.id),
  );
  assert.equal(after.snapshots.length, before.snapshots.length);
  assert.equal(preserved.selectedFields, captured.selectedFields);
  assert.equal(preserved.schemaId, captured.schemaId);
  await post('/proxy/demo/graphql', { query: 'query AfterRestart {suppliers{name}}' }, captureHeader);
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid="selection-coverage"]')?.textContent !== prev,
    beforeText,
    { timeout: 20000 },
  );
  const final = await get(api + '/analytics');
  const finished = await post(api + '/captures/' + capture.id + '/finish');
  assert.equal(finished.requests, 3);
  assert.equal(finished.selectedFields, 7);
  assert.equal(final.metrics.verifiedCoverage, 0);
  const refused = await fetch(origin + '/proxy/demo/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...captureHeader },
    body: JSON.stringify({ query: '{users{id}}' }),
  });
  assert.equal(refused.status, 409);
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    transport: 'Production nginx → Fastify Proxy → Yoga Demo API → PostgreSQL',
    fullComposeStopStart: true,
    volumeRemoved: false,
    captureId: capture.id,
    requestsPreserved: before.metrics.requests,
    capturedRequestsBeforeRestart: captured.requests,
    capturedFieldsBeforeRestart: captured.selectedFields,
    capturedTypesBeforeRestart: captured.selectedTypes,
    capturedRequestsAfterRestart: finished.requests,
    capturedFieldsAfterRestart: finished.selectedFields,
    schemaPreserved: true,
    requestIdsPreserved: true,
    snapshotPreserved: true,
    selectionCoverageBefore: before.metrics.selectionCoverage,
    selectionCoverageAfter: final.metrics.selectionCoverage,
    sseDashboardUpdatedWithoutReload: true,
    finishedTokenStatus: refused.status,
    verifiedCoverage: final.metrics.verifiedCoverage,
    browserJavascriptErrors: errors,
  };
  await writeFile(new URL('./runtime.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
