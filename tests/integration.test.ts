import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Analytics, TestRun } from '../packages/shared/src/index.js';
let app: FastifyInstance,
  demo: Server,
  root: string,
  pool: (typeof import('../apps/server/src/db.js'))['pool'];
const gql = async (query: string, variables?: Record<string, unknown>, operationName?: string) =>
  fetch(root + '/proxy/demo/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables, operationName }),
  });
const metrics = async () => {
  const r = await fetch(root + '/api/projects/demo/analytics');
  expect(r.status).toBe(200);
  return (await r.json()) as Analytics;
};
const post = async (path: string, body: unknown = {}) => {
  const r = await fetch(root + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
};
beforeAll(async () => {
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://innosight:innosight@localhost:5432/innosight_test';
  if (!new URL(process.env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Integration tests require a database ending with _test');
  const { makeDemoServer } = await import('../apps/demo-api/src/app.js');
  demo = makeDemoServer();
  await new Promise<void>((resolve) => demo.listen(0, '127.0.0.1', resolve));
  process.env.DEMO_API_URL = `http://127.0.0.1:${(demo.address() as AddressInfo).port}/graphql`;
  const db = await import('../apps/server/src/db.js');
  pool = db.pool;
  const { createApp } = await import('../apps/server/src/app.js');
  app = await createApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  root = app.listeningOrigin;
  await post('/api/projects/demo/reset');
});
afterAll(async () => {
  await app?.close();
  await new Promise<void>((resolve) => demo?.close(() => resolve()));
  await pool?.end();
});
describe('Real GraphQL Demo → Proxy → PostgreSQL → Analytics', () => {
  it('health and readiness prove database and schema are available', async () => {
    expect((await fetch(root + '/health')).status).toBe(200);
    expect((await fetch(root + '/ready')).status).toBe(200);
    const a = await metrics();
    expect(a.metrics.requests).toBe(3);
    expect(a.metrics.selectionCoverage).toBe(25.25);
    expect(a.metrics.verifiedCoverage).toBe(0);
  });
  it('forwards actual response without changing its business meaning', async () => {
    const query = 'query Identity($id:ID!){user(id:$id){id name email}}';
    const direct = await fetch(process.env.DEMO_API_URL!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: 'u2' } }),
    });
    const result = await gql(query, { id: 'u2' });
    expect(result.status).toBe(direct.status);
    expect(await result.json()).toEqual(await direct.json());
    expect(result.headers.get('x-innosight-request-id')).toBeTruthy();
  });
  it('persists selected fields and increases coverage from an unseen field', async () => {
    const before = await metrics();
    const res = await gql('query SupplierDiscovery { suppliers { leadTimeDays rating } }');
    expect(res.status).toBe(200);
    expect((await res.json()).data.suppliers[0].leadTimeDays).toBe(7);
    const after = await metrics();
    expect(after.metrics.observed - before.metrics.observed).toBe(3);
    expect(after.metrics.requests).toBe(before.metrics.requests + 1);
    const row = await pool.query('SELECT * FROM request_events WHERE id=$1', [
      res.headers.get('x-innosight-request-id'),
    ]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].fields).toContain('Supplier.leadTimeDays');
  });
  it('supports GET query, variables, named operations, fragments and aliases', async () => {
    const query =
      'query A { products { id } } query B($id:ID!){ customer:user(id:$id){ ...Contact } } fragment Contact on User { email }';
    const url = new URL(root + '/proxy/demo/graphql');
    url.searchParams.set('query', query);
    url.searchParams.set('variables', JSON.stringify({ id: 'u1' }));
    url.searchParams.set('operationName', 'B');
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect((await r.json()).data.customer.email).toBe('anna@example.test');
    const a = await metrics();
    expect(a.recent[0].fields.sort()).toEqual(['Query.user', 'User.email']);
  });
  it('rejects GET mutations without executing upstream or persisting fake requests', async () => {
    const before = await metrics();
    const r = await fetch(
      root +
        '/proxy/demo/graphql?query=' +
        encodeURIComponent('mutation { markNotificationRead(id:"n1") { id } }'),
    );
    expect(r.status).toBe(405);
    expect((await metrics()).metrics.requests).toBe(before.metrics.requests);
  });
  it('records GraphQL errors inside HTTP 200, preserving actual error response', async () => {
    const r = await gql('query Incident { unstablePayment { id } }');
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b.errors[0].extensions.code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    const a = await metrics();
    expect(a.recent[0].errors[0].code).toBe('PAYMENT_PROVIDER_UNAVAILABLE');
    expect(a.recent[0].status).toBe(200);
    expect(a.metrics.errors).toBeGreaterThan(0);
  });
  it('preserves validation errors and excludes invalid selections from coverage', async () => {
    const before = await metrics();
    const r = await gql('query Invalid { products { invalidField } }');
    expect(r.status).toBe(400);
    expect((await r.json()).errors.length).toBeGreaterThan(0);
    const after = await metrics();
    expect(after.metrics.observed).toBe(before.metrics.observed);
    expect(after.recent[0].fields).toEqual([]);
    expect(after.recent[0].analysisError).toBeTruthy();
  });
  it('records upstream HTTP errors and actual error body', async () => {
    const { makeDemoServer: _unused } = await import('../apps/demo-api/src/app.js');
    const { createServer } = await import('node:http');
    const upstream = createServer((_req, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end('{"error":"maintenance"}');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const r = await gql('{ users { id } }');
      expect(r.status).toBe(503);
      expect(await r.json()).toEqual({ error: 'maintenance' });
      expect((await metrics()).recent[0].errors[0].code).toBe('HTTP_ERROR');
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
  it('handles refused upstream connections and persists the failure', async () => {
    await pool.query("UPDATE projects SET upstream='http://127.0.0.1:1/graphql' WHERE id='demo'");
    try {
      const r = await gql('{ users { id } }');
      expect(r.status).toBe(502);
      expect((await r.json()).errors[0].extensions.code).toBe('UPSTREAM_UNAVAILABLE');
      expect((await metrics()).recent[0].status).toBe(502);
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
    }
  });
  it('does not persist headers, variables, response data or query literals', async () => {
    const query = 'query Private { user(id:"sensitive-id") { email } }';
    const r = await fetch(root + '/proxy/demo/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer secret-header' },
      body: JSON.stringify({ query, variables: { token: 'secret-variable' } }),
    });
    await r.text();
    const row = (
      await pool.query('SELECT * FROM request_events WHERE id=$1', [r.headers.get('x-innosight-request-id')])
    ).rows[0];
    const text = JSON.stringify(row);
    expect(text).not.toContain('sensitive-id');
    expect(text).not.toContain('secret-header');
    expect(text).not.toContain('secret-variable');
    expect(row.safe_query).toContain('[redacted]');
  });
  it('runs eight real tests and persists successful assertions and verified fields', async () => {
    const r = await post('/api/projects/demo/tests/run');
    expect(r.status).toBe(200);
    const run = r.body as TestRun;
    expect(run.failed).toBe(0);
    expect(run.passed).toBe(8);
    expect(run.after).toBeGreaterThan(run.before);
    expect(run.results.every((r) => r.assertions.length > 0)).toBe(true);
    expect(run.results.find((r) => r.caseId === 'demo-error')?.verifiedFields).toEqual([]);
    const row = await pool.query('SELECT * FROM test_runs WHERE id=$1', [run.id]);
    expect(row.rows[0].results[0].assertions[0].passed).toBe(true);
    expect((await metrics()).metrics.verifiedCoverage).toBe(run.after);
  });
  it('a test with no assertions cannot raise verified coverage', async () => {
    const created = await post('/api/projects/demo/tests', {
      name: 'No assertions',
      query: 'query Unverified { node(id:"u1") { id } }',
      assertions: [],
    });
    expect(created.status).toBe(201);
    const before = (await metrics()).metrics.verifiedCoverage;
    const result = await post('/api/projects/demo/tests/run', { caseId: created.body.id });
    expect(result.status).toBe(200);
    expect(result.body.failed).toBe(1);
    expect(result.body.results[0].verifiedFields).toEqual([]);
    expect((await metrics()).metrics.verifiedCoverage).toBe(before);
    await pool.query('DELETE FROM test_cases WHERE id=$1', [created.body.id]);
  });
  it('failed assertions do not verify otherwise selected fields', async () => {
    const created = await post('/api/projects/demo/tests', {
      name: 'Failing assertion',
      query: 'query NotVerified { node(id:"u1") { id } }',
      assertions: [{ path: 'data.node.id', operator: 'equals', expected: 'wrong' }],
    });
    const before = (await metrics()).metrics.verifiedCoverage;
    const result = await post('/api/projects/demo/tests/run', { caseId: created.body.id });
    expect(result.body.failed).toBe(1);
    expect((await metrics()).metrics.verifiedCoverage).toBe(before);
    await pool.query('DELETE FROM test_cases WHERE id=$1', [created.body.id]);
  });
  it('SSE sends real updates after a proxied request', async () => {
    const controller = new AbortController();
    const res = await fetch(root + '/api/projects/demo/events', { signal: controller.signal });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('event: connected');
    await gql('query SSEEvent { users { id } }');
    const update = new TextDecoder().decode((await reader.read()).value);
    expect(update).toContain('event: update');
    expect(update).toContain('request');
    controller.abort();
  });
  it('semantic schema diff links changes to observed operations and test evidence', async () => {
    const r = await post('/api/projects/demo/demo/changes');
    expect(r.status).toBe(200);
    const a = await metrics();
    expect(a.changes).toHaveLength(2);
    const email = a.changes.find((c) => c.coordinate === 'User.email')!;
    expect(email.observedRequests).toBeGreaterThan(0);
    expect(email.operations.some((o) => o.name === 'Customers')).toBe(true);
    expect(email.testIds).toContain('demo-users');
    expect(a.schema.sdl).toContain('email: String!');
  });
  it('exports valid JSON, CSV, risks and printable HTML, and saves snapshots', async () => {
    for (const format of ['json', 'csv', 'risks', 'html']) {
      const r = await fetch(root + '/api/projects/demo/report/' + format);
      expect(r.status).toBe(200);
      const text = await r.text();
      expect(text.length).toBeGreaterThan(100);
      if (format === 'json') expect(JSON.parse(text).methodology).toContain('Selection coverage');
      if (format === 'html') expect(text).toContain('window.print()');
    }
    const snapshot = await post('/api/projects/demo/snapshots', { label: 'Integration checkpoint' });
    expect(snapshot.status).toBe(201);
    expect((await metrics()).snapshots[0].label).toBe('Integration checkpoint');
  });
  it('validates inputs and protects external project configuration', async () => {
    expect((await fetch(root + '/api/projects/unknown-project/tests')).status).toBe(404);
    const missing = await fetch(root + '/api/unknown-endpoint');
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('NOT_FOUND');
    expect((await post('/api/projects', { name: 'Bad', upstream: 'http://169.254.169.254/' })).status).toBe(
      403,
    );
    expect((await post('/proxy/demo/graphql', { query: '{users{id}}', variables: [] })).status).toBe(400);
    expect((await fetch(root + '/api/projects/demo/requests?page=-1')).status).toBe(400);
    expect((await post('/api/projects/demo/schemas/import', { sdl: 'not sdl' })).status).toBe(400);
  });
  it('cancels upstream when a client disconnects and prevents reset racing with a proxy write', async () => {
    const { createServer } = await import('node:http');
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r));
    let closed = false;
    const upstream = createServer((_req, res) => {
      started();
      const timer = setTimeout(() => res.end('{"data":{}}'), 2000);
      res.on('close', () => {
        closed = true;
        clearTimeout(timer);
      });
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const controller = new AbortController();
      const call = fetch(root + '/proxy/demo/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'query CancelledOperation { users { id } }' }),
        signal: controller.signal,
      }).catch(() => null);
      await ready;
      expect((await post('/api/projects/demo/reset')).status).toBe(409);
      controller.abort();
      await call;
      await expect
        .poll(
          async () =>
            (await metrics()).recent.find((e) => e.operationName === 'CancelledOperation')?.errors[0]?.code,
        )
        .toBe('CLIENT_CANCELLED');
      expect(closed).toBe(true);
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
  it('enforces the real upstream timeout and persists a 504 event', async () => {
    const { createServer } = await import('node:http');
    const upstream = createServer((_req, res) => {
      const timer = setTimeout(() => res.end('{"data":{}}'), 15000);
      res.on('close', () => clearTimeout(timer));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const r = await gql('query TimedOutOperation { users { id } }');
      expect(r.status).toBe(504);
      expect((await r.json()).errors[0].extensions.code).toBe('UPSTREAM_TIMEOUT');
      expect((await metrics()).recent[0].duration).toBeGreaterThanOrEqual(9900);
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
  it('records invalid upstream JSON without replacing the actual response or HTTP status', async () => {
    const { createServer } = await import('node:http');
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('not-graphql-json');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const r = await gql('query InvalidResponse {users{id}}');
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('not-graphql-json');
      expect((await metrics()).recent[0].errors[0].code).toBe('INVALID_UPSTREAM_RESPONSE');
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
  it('limits upstream response size without persisting response contents', async () => {
    const { createServer } = await import('node:http');
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ private: 'x'.repeat(6 * 1024 * 1024) }));
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const r = await gql('query LargeResponse { users { id } }');
      expect(r.status).toBe(502);
      expect((await r.json()).errors[0].extensions.code).toBe('UPSTREAM_RESPONSE_TOO_LARGE');
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((r) => upstream.close(() => r()));
    }
  });
  it('connects an authenticated HTTPS project, isolates its evidence and refuses upstream redirects', async () => {
    const { mkdtemp, readFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { createServer } = await import('node:https');
    const tls = await import('node:tls');
    const folder = await mkdtemp(join(tmpdir(), 'innosight-tls-test-'));
    const keyFile = join(folder, 'key.pem'),
      certFile = join(folder, 'cert.pem');
    const env = {
      admin: process.env.ADMIN_TOKEN,
      allow: process.env.UPSTREAM_ALLOWLIST,
      headers: process.env.UPSTREAM_HEADERS_JSON,
    };
    const certificates = tls.getCACertificates('default');
    let server: import('node:https').Server | undefined;
    const projectIds: string[] = [];
    let privateCalls = 0;
    try {
      await promisify(execFile)('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyFile,
        '-out',
        certFile,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
        '-days',
        '1',
      ]);
      const key = await readFile(keyFile),
        cert = await readFile(certFile, 'utf8');
      tls.setDefaultCACertificates([...certificates, cert]);
      const listener = demo.listeners('request')[0];
      server = createServer({ key, cert }, (req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { location: '/private' });
          res.end();
          return;
        }
        if (req.url === '/private') {
          privateCalls++;
          res.end('{}');
          return;
        }
        if (req.headers.authorization !== 'Bearer integration-upstream-secret') {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end('{"errors":[{"message":"Unauthorized"}]}');
          return;
        }
        listener(req, res);
      });
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const upstream = origin + '/graphql';
      process.env.ADMIN_TOKEN = 'integration-admin-token';
      process.env.UPSTREAM_ALLOWLIST = upstream + ',' + origin + '/redirect';
      process.env.UPSTREAM_HEADERS_JSON = JSON.stringify({
        [upstream]: { authorization: 'Bearer integration-upstream-secret' },
      });
      const authorizedPost = async (path: string, body: unknown) => {
        const r = await fetch(root + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer integration-admin-token' },
          body: JSON.stringify(body),
        });
        return { status: r.status, body: await r.json() };
      };
      const baseline = await metrics();
      const created = await authorizedPost('/api/projects', {
        name: 'Authenticated HTTPS API',
        description: 'Real local TLS integration fixture',
        upstream,
      });
      expect(created.status).toBe(201);
      const id = created.body.id;
      projectIds.push(id);
      expect((await post('/api/projects/' + id + '/captures', { label: 'Forbidden' })).status).toBe(403);
      const externalCapture = await authorizedPost('/api/projects/' + id + '/captures', {
        label: 'Private CI',
      });
      expect(externalCapture.status).toBe(201);
      expect(
        (await post('/api/projects/' + id + '/captures/' + externalCapture.body.id + '/finish')).status,
      ).toBe(403);
      const wrongProject = await fetch(root + '/proxy/demo/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-innosight-capture': externalCapture.body.token },
        body: JSON.stringify({ query: '{users{id}}' }),
      });
      expect(wrongProject.status).toBe(401);
      expect(
        (await (await fetch(root + '/api/projects/demo/captures/' + externalCapture.body.id)).json()).error
          .code,
      ).toBe('NOT_FOUND');
      const finished = await authorizedPost(
        '/api/projects/' + id + '/captures/' + externalCapture.body.id + '/finish',
        {},
      );
      expect(finished.status).toBe(200);
      const result = await fetch(root + '/proxy/' + id + '/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: 'query ExternalUsers { users { id name } }' }),
      });
      expect(result.status).toBe(200);
      expect((await result.json()).data.users[0].name).toBe('Анна Смирнова');
      const own = await (await fetch(root + '/api/projects/' + id + '/analytics')).json();
      expect(own.metrics.requests).toBe(1);
      expect(own.metrics.observed).toBe(3);
      expect((await metrics()).metrics.requests).toBe(baseline.metrics.requests);
      const registered = await authorizedPost('/api/projects/' + id + '/tests', {
        name: 'External assertion',
        query: '{users{id name}}',
        assertions: [{ path: 'data.users.0.name', operator: 'equals', expected: 'Анна Смирнова' }],
      });
      expect(registered.status).toBe(201);
      expect((await post('/api/projects/' + id + '/tests/run')).status).toBe(403);
      const run = await authorizedPost('/api/projects/' + id + '/tests/run', {});
      expect(run.body.passed).toBe(1);
      expect(run.body.results[0].verifiedFields.sort()).toEqual(['Query.users', 'User.name']);
      expect((await post('/api/projects/' + id + '/reset')).status).toBe(403);
      const logged = await pool.query('SELECT safe_query,errors FROM request_events WHERE project_id=$1', [
        id,
      ]);
      expect(JSON.stringify(logged.rows)).not.toContain('integration-upstream-secret');
      const schema = (await (await fetch(root + '/api/projects/' + id + '/analytics')).json()).schema.sdl;
      const redirect = await authorizedPost('/api/projects', {
        name: 'Redirect fixture',
        upstream: origin + '/redirect',
        sdl: schema,
      });
      expect(redirect.status).toBe(201);
      projectIds.push(redirect.body.id);
      const refused = await fetch(root + '/proxy/' + redirect.body.id + '/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{users{id}}' }),
      });
      expect(refused.status).toBe(502);
      expect(privateCalls).toBe(0);
    } finally {
      if (projectIds.length) await pool.query('DELETE FROM projects WHERE id=ANY($1::text[])', [projectIds]);
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      tls.setDefaultCACertificates(certificates);
      for (const [name, value] of Object.entries({
        ADMIN_TOKEN: env.admin,
        UPSTREAM_ALLOWLIST: env.allow,
        UPSTREAM_HEADERS_JSON: env.headers,
      })) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('external test capture isolates real selections, redacts its secret and never fabricates verified coverage', async () => {
    const before = await metrics();
    const created = await post('/api/projects/demo/captures', { label: 'CI build 42' });
    expect(created.status).toBe(201);
    expect(created.body.selectionCoverage).toBe(0);
    expect(created.body.requests).toBe(0);
    const { id, token } = created.body;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await pool.query('SELECT token_hash FROM capture_sessions WHERE id=$1', [id]);
    expect(stored.rows[0].token_hash).not.toBe(token);
    const { hash } = await import('../apps/server/src/analysis.js');
    expect(stored.rows[0].token_hash).toBe(hash(token));
    const send = (query: string, captureToken = token) =>
      fetch(root + '/proxy/demo/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-innosight-capture': captureToken },
        body: JSON.stringify({ query }),
      });
    const result = await send('query CIUsers { users { id name } }');
    expect(result.status).toBe(200);
    expect((await result.json()).data.users[0].name).toBe('Анна Смирнова');
    await gql('query OutsideCI { suppliers { rating leadTimeDays } }');
    await send('query CIError { unstablePayment { id } }');
    const report = await (await fetch(root + '/api/projects/demo/captures/' + id)).json();
    expect(report.requests).toBe(2);
    expect(report.errors).toBe(1);
    expect(report.selectedFields).toBe(5);
    expect(report.selectionCoverage).toBe(5.05);
    expect(report.selectedTypes).toBe(3);
    expect(
      report.fields.find((f: { coordinate: string }) => f.coordinate === 'Supplier.rating').selected,
    ).toBe(false);
    expect((await metrics()).metrics.verifiedCoverage).toBe(before.metrics.verifiedCoverage);
    const history = await (await fetch(root + '/api/projects/demo/requests?capture=' + id)).json();
    expect(history.total).toBe(2);
    expect(
      history.items.every(
        (e: { captureId: string; origin: string }) => e.captureId === id && e.origin === 'test',
      ),
    ).toBe(true);
    const listing = await (await fetch(root + '/api/projects/demo/captures')).json();
    expect(JSON.stringify(listing)).not.toContain(token);
    const download = await fetch(root + '/api/projects/demo/captures/' + id + '/report');
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect((await download.json()).selectedFields).toBe(5);
    expect((await send('{users{id}}', 'a'.repeat(64))).status).toBe(401);
    const finish = await post('/api/projects/demo/captures/' + id + '/finish');
    expect(finish.body.finishedAt).toBeTruthy();
    const again = await post('/api/projects/demo/captures/' + id + '/finish');
    expect(again.body.finishedAt).toBe(finish.body.finishedAt);
    const refused = await send('{users{id}}');
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe('CAPTURE_FINISHED');
    expect((await (await fetch(root + '/api/projects/demo/captures/' + id)).json()).requests).toBe(2);
  });
  it('capture tokens never reach upstream and old-schema sessions cannot mix evidence with a new schema', async () => {
    const capture = await post('/api/projects/demo/captures', { label: 'Schema boundary' });
    const before = await metrics();
    const { createServer } = await import('node:http');
    let received: unknown = 'not-called';
    const upstream = createServer((req, res) => {
      received = req.headers['x-innosight-capture'];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":{"users":[]}}');
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [
      `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/graphql`,
    ]);
    try {
      const r = await fetch(root + '/proxy/demo/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-innosight-capture': capture.body.token },
        body: JSON.stringify({ query: '{users{id}}' }),
      });
      expect(r.status).toBe(200);
      expect(received).toBeUndefined();
    } finally {
      await pool.query("UPDATE projects SET upstream=$1 WHERE id='demo'", [process.env.DEMO_API_URL]);
      await new Promise<void>((r) => upstream.close(() => r()));
    }
    await post('/api/projects/demo/schemas/import', {
      sdl: before.schema.sdl.replace('name: String!', 'name: String! captureAudit: String'),
      activate: true,
    });
    const refused = await fetch(root + '/proxy/demo/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-innosight-capture': capture.body.token },
      body: JSON.stringify({ query: '{users{id}}' }),
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error.code).toBe('CAPTURE_SCHEMA_CHANGED');
    const preserved = await (await fetch(root + '/api/projects/demo/captures/' + capture.body.id)).json();
    expect(preserved.schemaId).toBe(before.schema.id);
    expect(preserved.requests).toBe(1);
    expect(preserved.totalFields).toBe(99);
    await post('/api/projects/demo/schemas/introspect');
  });
  it('active SSE connections close cleanly during backend shutdown', async () => {
    const connected = await fetch(root + '/api/projects/demo/events');
    const reader = connected.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('event: connected');
    const closed = app.close();
    while (!(await reader.read()).done) {
      /* drain event stream */
    }
    await closed;
    const { createApp } = await import('../apps/server/src/app.js');
    app = await createApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    root = app.listeningOrigin;
    const list = await (await fetch(root + '/api/projects/demo/captures')).json();
    expect(
      list.items.some(
        (r: { label: string; requests: number }) => r.label === 'CI build 42' && r.requests === 2,
      ),
    ).toBe(true);
  });
  it('events, schema versions and verified evidence survive a backend restart', async () => {
    const before = await metrics();
    await app.close();
    const { createApp } = await import('../apps/server/src/app.js');
    app = await createApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    root = app.listeningOrigin;
    const after = await metrics();
    expect(after.metrics.requests).toBe(before.metrics.requests);
    expect(after.metrics.selectionCoverage).toBe(before.metrics.selectionCoverage);
    expect(after.metrics.verifiedCoverage).toBe(before.metrics.verifiedCoverage);
    expect(after.schema.id).toBe(before.schema.id);
    expect(after.testRuns.length).toBe(before.testRuns.length);
  });
  it('schema activation scopes coverage to its version without erasing runtime history', async () => {
    const before = await metrics();
    const candidate = before.schema.sdl.replace('name: String!', 'name: String! auditTag: String');
    const imported = await post('/api/projects/demo/schemas/import', { sdl: candidate, activate: true });
    expect(imported.status).toBe(200);
    const after = await metrics();
    expect(after.metrics.observed).toBe(0);
    expect(after.metrics.verifiedCoverage).toBe(0);
    expect(after.metrics.requests).toBe(before.metrics.requests);
    expect(after.metrics.errors).toBe(before.metrics.errors);
    await post('/api/projects/demo/schemas/introspect');
    expect((await metrics()).metrics.selectionCoverage).toBe(before.metrics.selectionCoverage);
  });
  it('supports null optional GraphQL parameters and forwards known-text extensions', async () => {
    const r = await fetch(root + '/proxy/demo/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'query NullParameters { users { id } }',
        variables: null,
        operationName: null,
        extensions: { client: 'integration' },
      }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).data.users[0].id).toBe('u1');
  });
  it('schema imports require a valid query root and assertions require meaningful operands', async () => {
    expect((await post('/api/projects/demo/schemas/import', { sdl: 'type Lonely { id: ID! }' })).status).toBe(
      400,
    );
    expect(
      (
        await post('/api/projects/demo/tests', {
          name: 'Invalid equals',
          query: '{users{id}}',
          assertions: [{ path: 'data.users.0.id', operator: 'equals' }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post('/api/projects/demo/tests', {
          name: 'Invalid minLength',
          query: '{users{id}}',
          assertions: [{ path: 'data.users', operator: 'minLength', expected: -1 }],
        })
      ).status,
    ).toBe(400);
  });
  it('technical event replay is idempotent but separate client requests remain separate events', async () => {
    const a = await metrics();
    const { saveEvent } = await import('../apps/server/src/store.js');
    const event = a.recent[0];
    await saveEvent(event);
    await saveEvent(event);
    expect((await metrics()).metrics.requests).toBe(a.metrics.requests);
    await gql('query SeparateCall {users{id}}');
    await gql('query SeparateCall {users{id}}');
    expect((await metrics()).metrics.requests).toBe(a.metrics.requests + 2);
  });
  it('reset restores actual demo fixtures, removes history and verified coverage, and is repeatable', async () => {
    const r = await post('/api/projects/demo/reset');
    expect(r.status).toBe(200);
    const a = await metrics();
    expect(a.metrics.requests).toBe(3);
    expect(a.metrics.selectionCoverage).toBe(25.25);
    expect(a.metrics.verifiedCoverage).toBe(0);
    expect(a.testRuns).toEqual([]);
    expect(a.snapshots).toEqual([]);
    expect(a.changes).toEqual([]);
    expect((await (await fetch(root + '/api/projects/demo/captures')).json()).items).toEqual([]);
    const again = await post('/api/projects/demo/reset');
    expect(again.status).toBe(200);
    expect((await metrics()).metrics.requests).toBe(3);
  });
});
