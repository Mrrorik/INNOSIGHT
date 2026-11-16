import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const apiURL = process.env.API_URL || 'http://localhost:4000';
const webURL = process.env.WEB_URL || 'http://localhost:3000';
async function get(path: string) {
  const response = await fetch(apiURL + path);
  assert.equal(response.status, 200, path);
  return response.json();
}
async function post(path: string, body: unknown = {}, origin = apiURL) {
  const response = await fetch(origin + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return { response, body: await response.json() };
}
console.log('INNOSIGHT smoke: resets DEMO PROJECT only; external projects remain untouched.');
assert.equal((await get('/ready')).status, 'ready');
const web = await fetch(webURL);
assert.equal(web.status, 200);
assert.ok((await web.text()).includes('INNOSIGHT'));
await post('/api/projects/demo/reset');
const before = await get('/api/projects/demo/analytics');
assert.equal(before.metrics.requests, 3);
assert.equal(before.metrics.verifiedCoverage, 0);
const controller = new AbortController();
const stream = await fetch(webURL + '/api/projects/demo/events', { signal: controller.signal });
assert.equal(stream.status, 200);
const reader = stream.body!.getReader();
assert.ok(new TextDecoder().decode((await reader.read()).value).includes('event: connected'));
try {
  const operation = await post(
    '/proxy/demo/graphql',
    { query: 'query SmokeDiscovery { suppliers { leadTimeDays rating } }' },
    webURL,
  );
  assert.equal(operation.body.data.suppliers[0].leadTimeDays, 7);
  const requestId = operation.response.headers.get('x-innosight-request-id');
  assert.ok(requestId);
  const event = await get('/api/projects/demo/requests/' + requestId);
  assert.equal(event.operationName, 'SmokeDiscovery');
  assert.equal(event.fields.length, 3);
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.ok(update.includes('event: update'));
  const after = await get('/api/projects/demo/analytics');
  assert.equal(after.metrics.requests, before.metrics.requests + 1);
  assert.equal(after.metrics.observed, before.metrics.observed + 3);
  assert.equal(after.metrics.verifiedCoverage, 0);
  const error = await post(
    '/proxy/demo/graphql',
    { query: 'query SmokeIncident { unstablePayment { id } }' },
    webURL,
  );
  assert.equal(error.response.status, 200);
  assert.equal(error.body.errors[0].extensions.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  const tests = await post('/api/projects/demo/tests/run');
  assert.equal(tests.body.passed, 8);
  assert.equal(tests.body.failed, 0);
  assert.ok(tests.body.after > tests.body.before);
  const changes = await post('/api/projects/demo/demo/changes');
  assert.equal(changes.body.details.filter((change: any) => change.severity === 'breaking').length, 2);
  await post('/api/projects/demo/snapshots', { label: 'Smoke verification · real HTTP' });
  const reports: Record<string, number> = {};
  for (const format of ['json', 'csv', 'html', 'risks']) {
    const response = await fetch(webURL + '/api/projects/demo/report/' + format);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.length > 100);
    reports[format] = text.length;
  }
  const final = await get('/api/projects/demo/analytics');
  const results = {
    checkedAt: new Date().toISOString(),
    node: process.version,
    transport: 'Real HTTP via nginx frontend and Fastify backend; PostgreSQL persistence',
    before: before.metrics,
    afterQuery: after.metrics,
    final: final.metrics,
    requestId,
    tests: {
      passed: tests.body.passed,
      failed: tests.body.failed,
      before: tests.body.before,
      after: tests.body.after,
    },
    breakingChanges: final.changes.length,
    reportBytes: reports,
    sse: true,
  };
  await writeFile(
    new URL('../docs/SMOKE_RESULTS.json', import.meta.url),
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  controller.abort();
}
