import { configuredUpstreamHeaders } from './upstream.js';
import { randomUUID } from 'node:crypto';
import {
  buildClientSchema,
  getIntrospectionQuery,
  printSchema,
  buildSchema,
  assertValidSchema,
} from 'graphql';
import { pool } from './db.js';
import { describeSchema, hash } from './analysis.js';
import type { Project, SchemaInfo, RequestEvent, TestRun } from '../../../packages/shared/src/index.js';
export const projectRow = (r: any): Project => ({
  id: r.id,
  name: r.name,
  description: r.description,
  upstream: r.upstream,
  demo: r.demo,
  createdAt: new Date(r.created_at).toISOString(),
});
export const eventRow = (r: any): RequestEvent => ({
  id: r.id,
  projectId: r.project_id,
  schemaId: r.schema_id,
  createdAt: new Date(r.created_at).toISOString(),
  operationName: r.operation_name,
  operationType: r.operation_type,
  duration: r.duration,
  status: r.status,
  origin: r.origin,
  fields: r.fields,
  query: r.safe_query,
  errors: r.errors,
  fingerprint: r.fingerprint,
  analysisError: r.analysis_error,
  captureId: r.capture_id ?? null,
});
export const runRow = (r: any): TestRun => ({
  id: r.id,
  createdAt: new Date(r.created_at).toISOString(),
  results: r.results,
  passed: r.results.filter((t: any) => t.passed).length,
  failed: r.results.filter((t: any) => !t.passed).length,
  before: r.before_coverage,
  after: r.after_coverage,
});
export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = 'BAD_REQUEST',
  ) {
    super(message);
  }
}
export async function getProject(id: string) {
  const { rows } = await pool.query('SELECT * FROM projects WHERE id=$1', [id]);
  if (!rows.length) throw new APIError(404, 'Проект не найден', 'NOT_FOUND');
  return projectRow(rows[0]);
}
const cache = new Map<string, SchemaInfo>();
export async function getSchema(projectId: string) {
  const { rows } = await pool.query(
    'SELECT s.* FROM projects p JOIN schema_versions s ON s.id=p.active_schema_id WHERE p.id=$1',
    [projectId],
  );
  if (!rows.length)
    throw new APIError(
      409,
      'Схема не загружена. Импортируйте SDL или запустите introspection.',
      'SCHEMA_REQUIRED',
    );
  const r = rows[0];
  if (!cache.has(r.id)) cache.set(r.id, describeSchema(r.sdl, r.id, new Date(r.created_at).toISOString()));
  return cache.get(r.id)!;
}
export async function saveSchema(projectId: string, sdl: string, activate = true) {
  assertValidSchema(buildSchema(sdl));
  const normalized = printSchema(buildSchema(sdl));
  const { rows } = await pool.query(
    'INSERT INTO schema_versions(id,project_id,sdl,hash) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,hash) DO UPDATE SET hash=EXCLUDED.hash RETURNING *',
    [randomUUID(), projectId, normalized, hash(normalized)],
  );
  const r = rows[0];
  if (activate) await pool.query('UPDATE projects SET active_schema_id=$1 WHERE id=$2', [r.id, projectId]);
  return describeSchema(r.sdl, r.id, new Date(r.created_at).toISOString());
}
export async function introspect(project: Project) {
  const res = await fetch(project.upstream, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...configuredUpstreamHeaders(project.upstream) },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  if (!res.ok) throw new APIError(502, `Introspection вернул HTTP ${res.status}`, 'UPSTREAM_ERROR');
  const body: any = await res.json();
  if (body.errors || !body.data)
    throw new APIError(502, 'Introspection недоступен. Используйте импорт SDL.', 'INTROSPECTION_FAILED');
  return saveSchema(project.id, printSchema(buildClientSchema(body.data)));
}
export async function events(projectId: string, schemaId?: string) {
  const { rows } = await pool.query(
    `SELECT * FROM request_events WHERE project_id=$1 ${schemaId ? 'AND schema_id=$2' : ''} ORDER BY created_at`,
    schemaId ? [projectId, schemaId] : [projectId],
  );
  return rows.map(eventRow);
}
export async function saveEvent(event: RequestEvent) {
  await pool.query(
    `INSERT INTO request_events(id,project_id,schema_id,created_at,operation_name,operation_type,duration,status,origin,fields,safe_query,errors,fingerprint,analysis_error,capture_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO NOTHING`,
    [
      event.id,
      event.projectId,
      event.schemaId,
      event.createdAt,
      event.operationName,
      event.operationType,
      event.duration,
      event.status,
      event.origin,
      JSON.stringify(event.fields),
      event.query,
      JSON.stringify(event.errors),
      event.fingerprint,
      event.analysisError,
      event.captureId ?? null,
    ],
  );
}
