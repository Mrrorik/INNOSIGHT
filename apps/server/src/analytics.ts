import { pool } from './db.js';
import { getProject, getSchema, events, runRow } from './store.js';
import { percent, percentile, scoreField, findings, diffSchemas } from './analysis.js';
import type {
  Analytics,
  FieldStat,
  RequestEvent,
  TimelinePoint,
} from '../../../packages/shared/src/index.js';
export async function analytics(projectId: string, range = '24h'): Promise<Analytics> {
  const [project, schema] = await Promise.all([getProject(projectId), getSchema(projectId)]);
  const [projectEvents, ver, runs, snapshots, versions] = await Promise.all([
    events(projectId),
    pool.query('SELECT coordinate,case_id FROM verified_fields WHERE project_id=$1 AND schema_id=$2', [
      projectId,
      schema.id,
    ]),
    pool.query('SELECT * FROM test_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 30', [projectId]),
    pool.query('SELECT * FROM coverage_snapshots WHERE project_id=$1 ORDER BY created_at DESC LIMIT 100', [
      projectId,
    ]),
    pool.query('SELECT * FROM schema_versions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20', [
      projectId,
    ]),
  ]);
  const all = projectEvents.filter((e) => e.schemaId === schema.id);
  const counts = new Map<string, { observed: number; errors: number }>();
  for (const event of all)
    for (const coordinate of new Set(event.fields)) {
      const count = counts.get(coordinate) || { observed: 0, errors: 0 };
      count.observed++;
      if (event.errors.length || event.status >= 400) count.errors++;
      counts.set(coordinate, count);
    }
  const hours = range === '1h' ? 1 : range === '7d' ? 168 : range === 'all' ? Infinity : 24;
  const since = Date.now() - hours * 3600000;
  const current = projectEvents.filter((e) => new Date(e.createdAt).getTime() >= since);
  const fields: FieldStat[] = schema.fields.map((f) => {
    const selected = counts.get(f.coordinate) || { observed: 0, errors: 0 };
    const testIds = [
      ...new Set(ver.rows.filter((v) => v.coordinate === f.coordinate).map((v) => v.case_id as string)),
    ];
    const row = {
      ...f,
      observed: selected.observed,
      errors: selected.errors,
      verified: testIds.length > 0,
      testIds,
    };
    return { ...row, ...scoreField(row) };
  });
  const observed = fields.filter((f) => f.observed).length,
    verified = fields.filter((f) => f.verified).length;
  const errorEvents = current.filter((e) => e.status >= 400 || e.errors.length);
  const durations = current.map((e) => e.duration);
  const operations = new Map<string, RequestEvent[]>();
  for (const e of current) {
    const key = e.fingerprint;
    const group = operations.get(key) || [];
    group.push(e);
    operations.set(key, group);
  }
  const timeline: TimelinePoint[] = [];
  const end = Date.now();
  const start =
    range === 'all'
      ? projectEvents.reduce(
          (earliest, e) => Math.min(earliest, new Date(e.createdAt).getTime()),
          end - 3600000,
        )
      : end - Math.min(hours, 168) * 3600000;
  const step = (end - start) / 24;
  const seen = new Set(all.filter((e) => new Date(e.createdAt).getTime() < start).flatMap((e) => e.fields));
  for (let i = 0; i < 24; i++) {
    const a = start + i * step,
      b = a + step;
    const bucket = current.filter((e) => {
      const t = new Date(e.createdAt).getTime();
      return t >= a && (i === 23 ? t <= b : t < b);
    });
    bucket.filter((e) => e.schemaId === schema.id).forEach((e) => e.fields.forEach((f) => seen.add(f)));
    timeline.push({
      time: new Date(b).toISOString(),
      requests: bucket.length,
      errors: bucket.filter((e) => e.status >= 400 || e.errors.length).length,
      latency: bucket.length ? bucket.reduce((s, e) => s + e.duration, 0) / bucket.length : 0,
      coverage: percent(seen.size, fields.length),
    });
  }
  const buckets = [
    { bucket: '< 25 ms', min: 0, max: 25 },
    { bucket: '25–100', min: 25, max: 100 },
    { bucket: '100–500', min: 100, max: 500 },
    { bucket: '500–1000', min: 500, max: 1000 },
    { bucket: '> 1000', min: 1000, max: Infinity },
  ];
  const candidate = versions.rows.find((v) => v.id !== schema.id);
  const changes = candidate
    ? diffSchemas(
        schema.sdl,
        candidate.sdl,
        all,
        ver.rows.map((v) => ({ coordinate: v.coordinate, caseId: v.case_id })),
      )
    : [];
  return {
    project,
    schema,
    metrics: {
      total: fields.length,
      observed,
      verified,
      selectionCoverage: percent(observed, fields.length),
      verifiedCoverage: percent(verified, fields.length),
      requests: current.length,
      errors: errorEvents.length,
      errorRate: percent(errorEvents.length, current.length),
      averageLatency: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      p95Latency: Math.round(percentile(durations)),
      unobserved: fields.length - observed,
      successfulTests: runs.rows.reduce((s, r) => s + r.results.filter((t: any) => t.passed).length, 0),
    },
    fields,
    timeline,
    operations: [...operations.values()]
      .map((es) => ({
        fingerprint: es[0].fingerprint,
        name: es[0].operationName,
        type: es[0].operationType,
        requests: es.length,
        errors: es.filter((e) => e.errors.length || e.status >= 400).length,
        latency: Math.round(es.reduce((s, e) => s + e.duration, 0) / es.length),
        fields: [...new Set(es.flatMap((e) => e.fields))],
      }))
      .sort((a, b) => b.requests - a.requests),
    latencyDistribution: buckets.map((b) => ({
      bucket: b.bucket,
      count: durations.filter((d) => d >= b.min && d < b.max).length,
    })),
    errorBreakdown: [
      { name: 'GraphQL', count: current.filter((e) => e.status < 400 && e.errors.length).length },
      { name: 'HTTP', count: current.filter((e) => e.status >= 400 && e.status < 500).length },
      { name: 'Upstream / network', count: current.filter((e) => e.status >= 500).length },
    ],
    risks: findings(fields),
    recent: current.slice(-10).reverse(),
    testRuns: runs.rows.map(runRow),
    changes,
    snapshots: snapshots.rows.map((r) => ({
      id: r.id,
      createdAt: new Date(r.created_at).toISOString(),
      label: r.label,
      selectionCoverage: r.selection_coverage,
      verifiedCoverage: r.verified_coverage,
      schemaId: r.schema_id,
    })),
  };
}
