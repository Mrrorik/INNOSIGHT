import { withProjectMutation } from './locks.js';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { getProject, introspect, saveSchema, APIError } from './store.js';
import { proxy } from './proxy.js';
import { analytics } from './analytics.js';
import { demoTests, runTests } from './testing.js';
import { candidateSDL } from '../../demo-api/src/schema.js';
import { announce } from './live.js';
export const trafficQueries = [
  'query Catalog { products { id name price currency category { id name } } }',
  'query Customers { users { id name email orders { id total status } } }',
  'query OrderDetails { order(id: "o1") { id number total items { quantity product { name price } } payment { id status amount } } }',
  'query CatalogSearch { products(filter: {minPrice: 100}) { id name price inventory { available lowStock } } }',
  'query Revenue { analytics { revenue orderCount averageOrderValue } }',
  'query LegacyClient { products { id legacyPrice } users { id legacyName } }',
];
export async function ensureDemo() {
  const upstream = process.env.DEMO_API_URL || 'http://localhost:5000/graphql';
  await pool.query(
    "INSERT INTO projects(id,name,description,upstream,demo) VALUES('demo','Nexus Commerce','Демонстрационный e-commerce API · настоящие запросы, измеримые результаты',$1,true) ON CONFLICT(id) DO UPDATE SET upstream=EXCLUDED.upstream",
    [upstream],
  );
  for (const test of demoTests)
    await pool.query(
      'INSERT INTO test_cases(id,project_id,definition) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET definition=EXCLUDED.definition',
      [test.id, 'demo', JSON.stringify(test)],
    );
  const { rows } = await pool.query("SELECT active_schema_id FROM projects WHERE id='demo'");
  if (!rows[0].active_schema_id) await introspect(await getProject('demo'));
  const count = await pool.query("SELECT count(*) FROM request_events WHERE project_id='demo'");
  if (Number(count.rows[0].count) === 0) {
    for (const query of trafficQueries.slice(0, 3)) await proxy('demo', { query }, { origin: 'demo' });
  }
}
const active = new Set<string>();
async function runScenarioImpl(projectId: string, scenario: string) {
  const project = await getProject(projectId);
  if (!project.demo) throw new APIError(403, 'Demo Lab доступен только для demo project', 'DEMO_ONLY');
  if (active.has(projectId)) throw new APIError(409, 'Демосценарий уже выполняется', 'RUN_IN_PROGRESS');
  active.add(projectId);
  try {
    const before = (await analytics(projectId)).metrics;
    let message = '';
    let details: unknown = {};
    switch (scenario) {
      case 'discover': {
        const schema = await introspect(project);
        message = `Получена настоящая схема: ${schema.types.length} типов, ${schema.fields.length} output-полей.`;
        details = { schemaId: schema.id };
        break;
      }
      case 'traffic':
        for (const query of [...trafficQueries, ...trafficQueries.slice(0, 3)])
          await proxy(projectId, { query }, { origin: 'demo' });
        message = '9 настоящих GraphQL-запросов прошли через proxy и сохранены в PostgreSQL.';
        break;
      case 'blindspots': {
        const a = await analytics(projectId);
        message = `Обнаружено ${a.metrics.unobserved} ненаблюдавшихся и ${a.metrics.total - a.metrics.verified} неподтверждённых полей.`;
        details = { unobserved: a.fields.filter((f) => !f.observed).map((f) => f.coordinate) };
        break;
      }
      case 'incident':
        await proxy(
          projectId,
          { query: 'query PaymentIncident { unstablePayment { id status } }' },
          { origin: 'demo' },
        );
        await proxy(
          projectId,
          { query: 'query SlowAnalytics { slowAnalytics(delayMs: 800) { revenue orderCount } }' },
          { origin: 'demo' },
        );
        await proxy(
          projectId,
          { query: 'query InvalidField { products { nonexistentField } }' },
          { origin: 'demo' },
        );
        message =
          'Выполнены resolver error, медленный запрос и validation error. Ошибки и время ответа измерены.';
        break;
      case 'recover':
        details = await runTests(projectId);
        message =
          'Зарегистрированные тесты выполнены через proxy. Покрытие подтверждено только успешными assertions.';
        break;
      case 'changes': {
        await saveSchema(projectId, candidateSDL, false);
        const a = await analytics(projectId);
        details = a.changes;
        message = `Сравнены две сохранённые SDL-версии: ${a.changes.filter((c) => c.severity === 'breaking').length} breaking changes. Активная схема не изменена.`;
        break;
      }
      default:
        throw new APIError(400, 'Неизвестный сценарий');
    }
    const after = (await analytics(projectId)).metrics;
    const result = { id: randomUUID(), scenario, message, before, after, details };
    await pool.query('INSERT INTO demo_runs(id,project_id,scenario,result) VALUES($1,$2,$3,$4)', [
      result.id,
      projectId,
      scenario,
      JSON.stringify(result),
    ]);
    announce(projectId, 'demo', result);
    return result;
  } finally {
    active.delete(projectId);
  }
}
async function resetDemoImpl(projectId: string) {
  const project = await getProject(projectId);
  if (!project.demo) throw new APIError(403, 'Сброс разрешён только для demo project', 'DEMO_ONLY');
  if (active.has(projectId)) throw new APIError(409, 'Дождитесь завершения демосценария', 'RUN_IN_PROGRESS');
  const url = new URL('/internal/reset', project.upstream);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-demo-token': process.env.DEMO_INTERNAL_TOKEN || 'local-demo-internal' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new APIError(502, 'Не удалось сбросить Demo API', 'UPSTREAM_ERROR');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const table of [
      'verified_fields',
      'test_runs',
      'request_events',
      'capture_sessions',
      'coverage_snapshots',
      'demo_runs',
    ])
      await client.query(`DELETE FROM ${table} WHERE project_id=$1`, [projectId]);
    await client.query('DELETE FROM test_cases WHERE project_id=$1 AND NOT (id=ANY($2::text[]))', [
      projectId,
      demoTests.map((t) => t.id),
    ]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await introspect(project);
  await pool.query(
    'DELETE FROM schema_versions WHERE project_id=$1 AND id<>(SELECT active_schema_id FROM projects WHERE id=$1)',
    [projectId],
  );
  for (const query of trafficQueries.slice(0, 3)) await proxy(projectId, { query }, { origin: 'demo' });
  announce(projectId, 'reset');
  return {
    message: 'Demo сброшено. Базовые данные восстановлены, 3 реальных запроса создали исходное покрытие.',
  };
}

export const runScenario = (projectId: string, scenario: string) =>
  withProjectMutation(projectId, () => runScenarioImpl(projectId, scenario));
export const resetDemo = (projectId: string) =>
  withProjectMutation(projectId, () => resetDemoImpl(projectId));
