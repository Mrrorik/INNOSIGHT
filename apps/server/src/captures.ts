import { randomBytes, randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { getProject, getSchema, eventRow, APIError } from './store.js';
import { hash, describeSchema, percent, percentile } from './analysis.js';
import { withProjectMutation } from './locks.js';
import { announce } from './live.js';
import type { CaptureReport, CaptureSummary } from '../../../packages/shared/src/index.js';
export async function createCapture(projectId: string, label: string) {
  return withProjectMutation(projectId, async () => {
    await getProject(projectId);
    const schema = await getSchema(projectId);
    const id = randomUUID(),
      token = randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO capture_sessions(id,project_id,schema_id,label,token_hash) VALUES($1,$2,$3,$4,$5)',
      [id, projectId, schema.id, label, hash(token)],
    );
    announce(projectId, 'capture', { id });
    return { ...(await captureReport(projectId, id)), token };
  });
}
export async function resolveCapture(projectId: string, schemaId: string, token: string) {
  const { rows } = await pool.query(
    'SELECT id,schema_id,finished_at FROM capture_sessions WHERE project_id=$1 AND token_hash=$2',
    [projectId, hash(token)],
  );
  if (!rows.length)
    throw new APIError(401, 'Токен прогона не найден для этого проекта.', 'INVALID_CAPTURE_TOKEN');
  if (rows[0].finished_at)
    throw new APIError(
      409,
      'Прогон завершён. Создайте новый прогон для следующих запросов.',
      'CAPTURE_FINISHED',
    );
  if (rows[0].schema_id !== schemaId)
    throw new APIError(
      409,
      'Активная схема изменилась. Завершите прогон и создайте новый.',
      'CAPTURE_SCHEMA_CHANGED',
    );
  return rows[0].id as string;
}
export async function captureReport(projectId: string, id: string): Promise<CaptureReport> {
  await getProject(projectId);
  const { rows } = await pool.query(
    'SELECT c.*,s.sdl FROM capture_sessions c JOIN schema_versions s ON s.id=c.schema_id WHERE c.id=$1 AND c.project_id=$2',
    [id, projectId],
  );
  if (!rows.length) throw new APIError(404, 'Прогон не найден.', 'NOT_FOUND');
  const row = rows[0];
  const schema = describeSchema(row.sdl, row.schema_id);
  const events = (
    await pool.query(
      'SELECT * FROM request_events WHERE project_id=$1 AND capture_id=$2 ORDER BY created_at,id',
      [projectId, id],
    )
  ).rows.map(eventRow);
  const counts = new Map<string, { requests: number; failed: number }>();
  for (const e of events)
    for (const f of new Set(e.fields)) {
      const count = counts.get(f) || { requests: 0, failed: 0 };
      count.requests++;
      if (e.errors.length || e.status >= 400) count.failed++;
      counts.set(f, count);
    }
  const fields = schema.fields.map((f) => ({
    ...f,
    ...(counts.get(f.coordinate) || { requests: 0, failed: 0 }),
    selected: counts.has(f.coordinate),
  }));
  const types = [...new Set(fields.map((f) => f.typeName))].map((name) => {
    const group = fields.filter((f) => f.typeName === name);
    const selected = group.filter((f) => f.selected).length;
    return { name, selected, total: group.length, coverage: percent(selected, group.length) };
  });
  const selectedFields = fields.filter((f) => f.selected).length,
    selectedTypes = types.filter((t) => t.selected).length;
  return {
    id: row.id,
    projectId,
    schemaId: row.schema_id,
    label: row.label,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    requests: events.length,
    errors: events.filter((e) => e.errors.length || e.status >= 400).length,
    selectedFields,
    totalFields: fields.length,
    selectionCoverage: percent(selectedFields, fields.length),
    selectedTypes,
    totalTypes: types.length,
    typeCoverage: percent(selectedTypes, types.length),
    p95Latency: Math.round(percentile(events.map((e) => e.duration))),
    fields,
    types,
    methodology:
      'Покрытие прогона: уникальные output-поля и object/interface-типы, выбранные только запросами с токеном этого прогона, относительно закреплённой версии схемы. Ошибки resolver не отменяют факт selection. Это не resolver execution coverage и не подтверждение assertions. Внешний прогон сам по себе не увеличивает Verified Test Coverage.',
  };
}
export async function listCaptures(projectId: string): Promise<CaptureSummary[]> {
  await getProject(projectId);
  const { rows } = await pool.query(
    'SELECT id FROM capture_sessions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50',
    [projectId],
  );
  const reports = await Promise.all(rows.map((r) => captureReport(projectId, r.id)));
  return reports.map(({ fields: _fields, types: _types, methodology: _methodology, ...summary }) => summary);
}
export async function finishCapture(projectId: string, id: string) {
  return withProjectMutation(projectId, async () => {
    await captureReport(projectId, id);
    await pool.query(
      'UPDATE capture_sessions SET finished_at=COALESCE(finished_at,now()) WHERE id=$1 AND project_id=$2',
      [id, projectId],
    );
    announce(projectId, 'capture', { id });
    return captureReport(projectId, id);
  });
}
