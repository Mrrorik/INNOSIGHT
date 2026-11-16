import type { ServerResponse } from 'node:http';
import { createCapture, listCaptures, captureReport, finishCapture } from './captures.js';
import { configuredUpstreamHeaders } from './upstream.js';
import { withProjectMutation, withProjectActivity } from './locks.js';
import Fastify, { LogController } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  buildSchema,
  assertValidSchema,
  parse,
  getOperationAST,
  getNamedType,
  isCompositeType,
  isScalarType,
  isEnumType,
  isObjectType,
  isInterfaceType,
} from 'graphql';
import { pool, migrate } from './db.js';
import {
  getProject,
  getSchema,
  introspect,
  saveSchema,
  APIError,
  projectRow,
  eventRow,
  runRow,
} from './store.js';
import { proxy } from './proxy.js';
import { analytics } from './analytics.js';
import { ensureDemo, runScenario, resetDemo } from './demo.js';
import { runTests } from './testing.js';
import { live, announce } from './live.js';
import { diffSchemas } from './analysis.js';
import { csv, htmlReport } from './reports.js';
import { METHODOLOGY } from '../../../packages/shared/src/index.js';
const graphBody = z
  .object({
    query: z.string().min(1).max(100000),
    variables: z
      .record(z.string(), z.unknown())
      .nullish()
      .transform((v) => v ?? undefined),
    operationName: z
      .string()
      .max(200)
      .nullish()
      .transform((v) => v ?? undefined),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const idParams = z.object({ id: z.string().min(1).max(100) });
export function adminAuthorized(header: unknown) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || typeof header !== 'string') return false;
  const token = header.replace(/^Bearer /, '');
  const a = Buffer.from(expected),
    b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
function requireAdmin(header: unknown) {
  if (!adminAuthorized(header))
    throw new APIError(
      403,
      'Требуется ADMIN_TOKEN. Для внешних подключений задайте его в окружении.',
      'ADMIN_REQUIRED',
    );
}
export function validateUpstream(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new APIError(400, 'Некорректный URL upstream');
  }
  const allowed = (process.env.UPSTREAM_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    !allowed.includes(url.href)
  )
    throw new APIError(
      403,
      'Upstream должен быть HTTPS URL из точного серверного UPSTREAM_ALLOWLIST, без credentials, query и fragment.',
      'UPSTREAM_NOT_ALLOWED',
    );
  return url.href;
}
export async function createApp(options: { initialize?: boolean; logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.x-api-key',
            'req.headers.x-innosight-capture',
          ],
        }
      : false,
    bodyLimit: 128 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
  });
  const streams = new Set<ServerResponse>();
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
  });
  await app.register(cors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'DELETE'],
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } }),
  );
  app.setErrorHandler((error, _req, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    const status = error instanceof z.ZodError ? 400 : err.statusCode || 500;
    if (status >= 500) app.log.error({ code: err.code || 'INTERNAL_ERROR' }, 'Request failed');
    reply.code(status).send({
      error: {
        code: error instanceof z.ZodError ? 'VALIDATION_ERROR' : err.code || 'INTERNAL_ERROR',
        message:
          status >= 500 && !(error instanceof APIError)
            ? 'Внутренняя ошибка сервера'
            : error instanceof z.ZodError
              ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
              : err.message,
      },
    });
  });
  app.get('/health', async () => ({ status: 'ok', service: 'innosight', version: '1.1.0' }));
  app.get('/ready', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      const schema = await getSchema('demo');
      return { status: 'ready', database: true, schema: !!schema.id };
    } catch {
      reply.code(503);
      return { status: 'not_ready' };
    }
  });
  app.get('/api/meta', async () => ({
    methodology: METHODOLOGY,
    adminConfigured: !!process.env.ADMIN_TOKEN,
    mode: 'Local demonstration · demo actions do not require authentication',
    unsupported: [
      'multipart uploads',
      'WebSocket subscriptions',
      'incremental delivery / streaming',
      'APQ without query text',
    ],
    limits: { requestBytes: 131072, upstreamTimeoutMs: 10000, responseBytes: 5242880 },
  }));
  app.get('/api/projects', async () => ({
    items: (await pool.query('SELECT * FROM projects ORDER BY demo DESC,created_at')).rows.map(projectRow),
  }));
  app.post('/api/projects', async (req, reply) => {
    requireAdmin(req.headers.authorization);
    const body = z
      .object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).default(''),
        upstream: z.string().url(),
        sdl: z.string().max(500000).optional(),
      })
      .parse(req.body);
    const upstream = validateUpstream(body.upstream);
    const id = randomUUID();
    await pool.query('INSERT INTO projects(id,name,description,upstream) VALUES($1,$2,$3,$4)', [
      id,
      body.name,
      body.description,
      upstream,
    ]);
    try {
      const project = await getProject(id);
      if (body.sdl) await saveSchema(id, body.sdl);
      else await introspect(project);
      reply.code(201);
      return project;
    } catch (e) {
      await pool.query('DELETE FROM projects WHERE id=$1', [id]);
      throw e;
    }
  });
  app.get('/api/projects/:id/connection', async (req) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    try {
      const r = await fetch(project.upstream, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...configuredUpstreamHeaders(project.upstream) },
        body: JSON.stringify({ query: '{ __typename }' }),
        signal: AbortSignal.timeout(3000),
        redirect: 'error',
      });
      return { connected: r.ok, status: r.status, upstream: project.upstream };
    } catch {
      return { connected: false, status: 502, upstream: project.upstream };
    }
  });
  app.get('/api/projects/:id/analytics', async (req) => {
    const { id } = idParams.parse(req.params);
    const { range } = z.object({ range: z.enum(['1h', '24h', '7d', 'all']).default('24h') }).parse(req.query);
    return analytics(id, range);
  });
  app.get(
    '/api/projects/:id/coverage',
    async (req) => (await analytics(idParams.parse(req.params).id)).fields,
  );
  app.get(
    '/api/projects/:id/operations',
    async (req) => (await analytics(idParams.parse(req.params).id)).operations,
  );
  app.get('/api/projects/:id/risks', async (req) => (await analytics(idParams.parse(req.params).id)).risks);
  app.get('/api/projects/:id/requests', async (req) => {
    const { id } = idParams.parse(req.params);
    await getProject(id);
    const q = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        search: z.string().max(200).default(''),
        errors: z.enum(['true', 'false']).optional(),
        type: z.enum(['query', 'mutation', 'unknown']).optional(),
        field: z.string().max(200).optional(),
        capture: z.string().uuid().optional(),
        fingerprint: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        minDuration: z.coerce.number().min(0).optional(),
        range: z.enum(['1h', '24h', '7d', 'all']).default('24h'),
        sort: z.enum(['time', 'duration']).default('time'),
      })
      .parse(req.query);
    const values: any[] = [id];
    const where = ['project_id=$1'];
    const add = (clause: string, value: unknown) => {
      values.push(value);
      where.push(clause.replace('?', `$${values.length}`));
    };
    if (q.search) {
      values.push(`%${q.search}%`);
      where.push(`(operation_name ILIKE $${values.length} OR safe_query ILIKE $${values.length})`);
    }
    if (q.errors === 'true') where.push('(status>=400 OR jsonb_array_length(errors)>0)');
    if (q.errors === 'false') where.push('status<400 AND jsonb_array_length(errors)=0');
    if (q.type) add('operation_type=?', q.type);
    if (q.field) add('fields @> ?::jsonb', JSON.stringify([q.field]));
    if (q.capture) add('capture_id=?', q.capture);
    if (q.fingerprint) add('fingerprint=?', q.fingerprint);
    if (q.minDuration !== undefined) add('duration>=?', q.minDuration);
    if (q.range !== 'all')
      add(
        'created_at>=?::timestamptz',
        new Date(Date.now() - { '1h': 1, '24h': 24, '7d': 168 }[q.range] * 3600000).toISOString(),
      );
    const clause = where.join(' AND ');
    const count = await pool.query(`SELECT count(*) FROM request_events WHERE ${clause}`, values);
    values.push(q.limit, (q.page - 1) * q.limit);
    const rows = await pool.query(
      `SELECT * FROM request_events WHERE ${clause} ORDER BY ${q.sort === 'duration' ? 'duration' : 'created_at'} DESC,id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return {
      items: rows.rows.map(eventRow),
      total: Number(count.rows[0].count),
      page: q.page,
      limit: q.limit,
    };
  });
  app.get('/api/projects/:id/requests/:requestId', async (req) => {
    const { id, requestId } = z.object({ id: z.string(), requestId: z.string() }).parse(req.params);
    const { rows } = await pool.query('SELECT * FROM request_events WHERE project_id=$1 AND id=$2', [
      id,
      requestId,
    ]);
    if (!rows.length) throw new APIError(404, 'Запрос не найден', 'NOT_FOUND');
    return eventRow(rows[0]);
  });
  app.get('/api/projects/:id/schemas', async (req) => {
    const { id } = idParams.parse(req.params);
    await getProject(id);
    return {
      items: (
        await pool.query('SELECT * FROM schema_versions WHERE project_id=$1 ORDER BY created_at DESC', [id])
      ).rows.map((r) => ({ id: r.id, sdl: r.sdl, createdAt: r.created_at, hash: r.hash })),
    };
  });
  app.post('/api/projects/:id/schemas/introspect', async (req) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    const result = await withProjectMutation(id, () => introspect(project));
    announce(id, 'schema');
    return result;
  });
  app.post('/api/projects/:id/schemas/import', async (req) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    const body = z
      .object({ sdl: z.string().min(1).max(500000), activate: z.boolean().default(false) })
      .parse(req.body);
    try {
      assertValidSchema(buildSchema(body.sdl));
    } catch {
      throw new APIError(400, 'SDL содержит некорректную GraphQL-схему.');
    }
    const result = await withProjectMutation(id, () => saveSchema(id, body.sdl, body.activate));
    announce(id, 'schema');
    return result;
  });
  app.post('/api/projects/:id/schemas/diff', async (req) => {
    const { id } = idParams.parse(req.params);
    const body = z.object({ baseId: z.string(), targetId: z.string() }).parse(req.body);
    const { rows } = await pool.query(
      'SELECT * FROM schema_versions WHERE project_id=$1 AND id=ANY($2::text[])',
      [id, [body.baseId, body.targetId]],
    );
    const base = rows.find((r) => r.id === body.baseId),
      target = rows.find((r) => r.id === body.targetId);
    if (!base || !target) throw new APIError(404, 'Версия схемы не найдена');
    const ev = await pool.query('SELECT * FROM request_events WHERE project_id=$1 AND schema_id=$2', [
      id,
      base.id,
    ]);
    const v = await pool.query(
      'SELECT coordinate,case_id FROM verified_fields WHERE project_id=$1 AND schema_id=$2',
      [id, base.id],
    );
    return {
      changes: diffSchemas(
        base.sdl,
        target.sdl,
        ev.rows.map(eventRow),
        v.rows.map((r) => ({ coordinate: r.coordinate, caseId: r.case_id })),
      ),
    };
  });
  const handleProxy = async (req: any, reply: any) => {
    const { id } = idParams.parse(req.params);
    let input = req.body;
    if (req.method === 'GET') {
      const q = req.query;
      try {
        input = {
          query: q.query,
          variables: q.variables ? JSON.parse(q.variables) : undefined,
          operationName: q.operationName,
          extensions: q.extensions ? JSON.parse(q.extensions) : undefined,
        };
      } catch {
        throw new APIError(400, 'Variables и extensions должны быть JSON.');
      }
    }
    const body = graphBody.parse(input);
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.raw.on('aborted', abort);
    const disconnect = () => {
      if (!reply.raw.writableEnded) controller.abort();
    };
    reply.raw.on('close', disconnect);
    const headers: Record<string, string> = {};
    for (const name of ['authorization', 'x-api-key', 'accept-language'])
      if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    try {
      const result = await proxy(id, body, {
        method: req.method === 'GET' ? 'GET' : 'POST',
        signal: controller.signal,
        captureToken: z.string().min(32).max(256).optional().parse(req.headers['x-innosight-capture']),
        headers,
      });
      reply
        .header('x-innosight-request-id', result.event.id)
        .header('cache-control', 'no-store')
        .type(result.contentType)
        .code(result.status);
      return reply.send(result.text);
    } finally {
      req.raw.removeListener('aborted', abort);
      reply.raw.removeListener('close', disconnect);
    }
  };
  app.post('/proxy/:id/graphql', handleProxy);
  app.get('/proxy/:id/graphql', handleProxy);
  app.get('/api/projects/:id/captures', async (req) => ({
    items: await listCaptures(idParams.parse(req.params).id),
  }));
  app.post('/api/projects/:id/captures', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    const { label } = z.object({ label: z.string().trim().min(1).max(120) }).parse(req.body);
    reply.code(201);
    return createCapture(id, label);
  });
  app.get('/api/projects/:id/captures/:captureId', async (req) => {
    const { id, captureId } = z.object({ id: z.string(), captureId: z.string().uuid() }).parse(req.params);
    return captureReport(id, captureId);
  });
  app.post('/api/projects/:id/captures/:captureId/finish', async (req) => {
    const { id, captureId } = z.object({ id: z.string(), captureId: z.string().uuid() }).parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    return finishCapture(id, captureId);
  });
  app.get('/api/projects/:id/captures/:captureId/report', async (req, reply) => {
    const { id, captureId } = z.object({ id: z.string(), captureId: z.string().uuid() }).parse(req.params);
    reply.header('content-disposition', 'attachment; filename="innosight-test-capture.json"');
    return captureReport(id, captureId);
  });
  app.get('/api/projects/:id/tests', async (req) => {
    const { id } = idParams.parse(req.params);
    await getProject(id);
    return {
      items: (
        await pool.query('SELECT definition FROM test_cases WHERE project_id=$1 ORDER BY id', [id])
      ).rows.map((r) => r.definition),
      runs: (
        await pool.query('SELECT * FROM test_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30', [
          id,
        ])
      ).rows.map(runRow),
    };
  });
  app.post('/api/projects/:id/tests/run', async (req) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    const body = z.object({ caseId: z.string().optional() }).parse(req.body ?? {});
    return runTests(id, body.caseId);
  });
  app.post('/api/projects/:id/tests', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const project = await getProject(id);
    if (!project.demo) requireAdmin(req.headers.authorization);
    const definition = z
      .object({
        name: z.string().min(1).max(100),
        query: z.string().min(1).max(50000),
        variables: z.record(z.string(), z.unknown()).optional(),
        assertions: z
          .array(
            z
              .object({
                path: z.string().min(1).max(200),
                operator: z.enum(['exists', 'equals', 'minLength']),
                expected: z.unknown().optional(),
              })
              .superRefine((a, ctx) => {
                if (a.operator === 'equals' && a.expected === undefined)
                  ctx.addIssue({ code: 'custom', message: 'equals requires expected' });
                if (
                  a.operator === 'minLength' &&
                  (typeof a.expected !== 'number' || !Number.isInteger(a.expected) || a.expected < 0)
                )
                  ctx.addIssue({
                    code: 'custom',
                    message: 'minLength requires a non-negative integer expected',
                  });
              }),
          )
          .max(100),
        expectedError: z.boolean().optional(),
      })
      .parse(req.body);
    try {
      const op = getOperationAST(parse(definition.query));
      if (!op || op.operation !== 'query') throw new Error();
    } catch {
      throw new APIError(
        400,
        'Зарегистрированные пользовательские тесты должны содержать одну query. Mutation не запускаются автоматически.',
      );
    }
    const test = { ...definition, id: randomUUID() };
    await pool.query('INSERT INTO test_cases(id,project_id,definition) VALUES($1,$2,$3)', [
      test.id,
      id,
      JSON.stringify(test),
    ]);
    reply.code(201);
    return test;
  });
  app.get('/api/projects/:id/tests/suggestions', async (req) => {
    const { id } = idParams.parse(req.params);
    const a = await analytics(id);
    const schema = buildSchema(a.schema.sdl);
    const suggestions = Object.values(schema.getQueryType()?.getFields() || {}).map((f) => {
      const required = f.args.filter(
        (arg) => String(arg.type).endsWith('!') && arg.defaultValue === undefined,
      );
      const target = getNamedType(f.type);
      const output =
        isObjectType(target) || isInterfaceType(target)
          ? Object.values(target.getFields())
              .filter((sf) => {
                const t = getNamedType(sf.type);
                return (
                  (isScalarType(t) || isEnumType(t)) &&
                  !sf.args.some((arg) => String(arg.type).endsWith('!') && arg.defaultValue === undefined)
                );
              })
              .slice(0, 5)
              .map((sf) => sf.name)
          : [];
      return {
        name: f.name,
        requiresFixture: required.length > 0,
        arguments: required.map((arg) => ({ name: arg.name, type: String(arg.type) })),
        query: required.length
          ? null
          : `query Suggested_${f.name} { ${f.name}${isCompositeType(target) ? ' { ' + (output.length ? output.join(' ') : '__typename') + ' }' : ''} }`,
        reason: 'Предложение из схемы. Добавьте fixtures и assertions перед запуском.',
      };
    });
    return { items: suggestions };
  });
  app.post('/api/projects/:id/demo/:scenario', async (req) => {
    const { id, scenario } = z
      .object({
        id: z.string(),
        scenario: z.enum(['discover', 'traffic', 'blindspots', 'incident', 'recover', 'changes']),
      })
      .parse(req.params);
    return runScenario(id, scenario);
  });
  app.get('/api/projects/:id/demo/runs', async (req) => {
    const { id } = idParams.parse(req.params);
    await getProject(id);
    const { rows } = await pool.query(
      'SELECT result,created_at FROM demo_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30',
      [id],
    );
    return { items: rows.map((r) => ({ ...r.result, createdAt: new Date(r.created_at).toISOString() })) };
  });
  app.post('/api/projects/:id/reset', async (req) => resetDemo(idParams.parse(req.params).id));
  app.post('/api/projects/:id/snapshots', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const { label } = z.object({ label: z.string().min(1).max(100) }).parse(req.body);
    return withProjectActivity(id, async () => {
      const a = await analytics(id);
      const snapshotId = randomUUID();
      await pool.query(
        'INSERT INTO coverage_snapshots(id,project_id,schema_id,label,selection_coverage,verified_coverage) VALUES($1,$2,$3,$4,$5,$6)',
        [snapshotId, id, a.schema.id, label, a.metrics.selectionCoverage, a.metrics.verifiedCoverage],
      );
      announce(id, 'snapshot');
      reply.code(201);
      return { id: snapshotId };
    });
  });
  app.get('/api/projects/:id/report/:format', async (req, reply) => {
    const { id, format } = z
      .object({ id: z.string(), format: z.enum(['json', 'csv', 'html', 'risks']) })
      .parse(req.params);
    const a = await analytics(id);
    reply.header('cache-control', 'no-store');
    if (format === 'json' || format === 'risks') {
      reply.header('content-disposition', `attachment; filename="innosight-${format}.json"`);
      return format === 'risks'
        ? { generatedAt: new Date().toISOString(), project: a.project.name, risks: a.risks }
        : { generatedAt: new Date().toISOString(), methodology: METHODOLOGY, ...a };
    }
    if (format === 'csv') {
      reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="innosight-coverage.csv"');
      return '\uFEFF' + csv(a);
    }
    reply
      .type('text/html; charset=utf-8')
      .header(
        'content-security-policy',
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      );
    return htmlReport(a);
  });
  app.get('/api/projects/:id/events', async (req, reply) => {
    const { id } = idParams.parse(req.params);
    await getProject(id);
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ projectId: id })}\n\n`);
    const send = (data: unknown) => {
      if (!reply.raw.destroyed) reply.raw.write(`event: update\ndata: ${JSON.stringify(data)}\n\n`);
    };
    live.on(id, send);
    const timer = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 15000);
    reply.raw.on('close', () => {
      streams.delete(reply.raw);
      clearInterval(timer);
      live.off(id, send);
    });
  });
  if (options.initialize !== false) {
    await migrate();
    await ensureDemo();
  }
  return app;
}
