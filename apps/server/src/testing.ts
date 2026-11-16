import { withProjectMutation } from './locks.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pool } from './db.js';
import { proxy } from './proxy.js';
import { analytics } from './analytics.js';
import { getSchema, APIError } from './store.js';
import { announce } from './live.js';
import type {
  Assertion,
  AssertionResult,
  TestCase,
  TestResult,
  TestRun,
} from '../../../packages/shared/src/index.js';
export const demoTests: TestCase[] = [
  {
    id: 'demo-users',
    name: 'Пользователи · профиль и контакты',
    query: 'query TestUsers { users { id name email role country createdAt } }',
    assertions: [
      { path: 'data.users', operator: 'minLength', expected: 3 },
      { path: 'data.users.0.id', operator: 'equals', expected: 'u1' },
      { path: 'data.users.0.name', operator: 'equals', expected: 'Анна Смирнова' },
      { path: 'data.users.0.email', operator: 'equals', expected: 'anna@example.test' },
      { path: 'data.users.0.role', operator: 'equals', expected: 'CUSTOMER' },
      { path: 'data.users.0.country', operator: 'equals', expected: 'RU' },
      { path: 'data.users.0.createdAt', operator: 'exists' },
    ],
  },
  {
    id: 'demo-products',
    name: 'Каталог · связи, цены и склад',
    query:
      'query TestProducts { products { id name price currency sku active category { id name } inventory { available reserved warehouse lowStock } supplier { id name country } } }',
    assertions: [
      { path: 'data.products', operator: 'minLength', expected: 4 },
      ...[
        'id',
        'name',
        'price',
        'currency',
        'sku',
        'active',
        'category.id',
        'category.name',
        'inventory.available',
        'inventory.reserved',
        'inventory.warehouse',
        'inventory.lowStock',
        'supplier.id',
        'supplier.name',
        'supplier.country',
      ].map((path) => ({ path: `data.products.0.${path}`, operator: 'exists' as const })),
      { path: 'data.products.0.price', operator: 'equals', expected: 249 },
    ],
  },
  {
    id: 'demo-orders',
    name: 'Заказы · оплата, доставка и позиции',
    query:
      'query TestOrders { orders { id number status total createdAt user { id email } items { id quantity unitPrice subtotal product { id name } } payment { id method amount currency status transactionId } shipment { id carrier trackingNumber estimatedDelivery delivered } } }',
    assertions: [
      { path: 'data.orders', operator: 'minLength', expected: 3 },
      ...[
        'id',
        'number',
        'status',
        'total',
        'createdAt',
        'user.id',
        'user.email',
        'items.0.id',
        'items.0.quantity',
        'items.0.unitPrice',
        'items.0.subtotal',
        'items.0.product.id',
        'items.0.product.name',
        'payment.id',
        'payment.method',
        'payment.amount',
        'payment.currency',
        'payment.status',
        'payment.transactionId',
        'shipment.id',
        'shipment.carrier',
        'shipment.trackingNumber',
        'shipment.estimatedDelivery',
        'shipment.delivered',
      ].map((path) => ({ path: `data.orders.0.${path}`, operator: 'exists' as const })),
      { path: 'data.orders.0.total', operator: 'equals', expected: 408 },
    ],
  },
  {
    id: 'demo-user',
    name: 'Пользователь по ID · вложенные связи',
    query:
      'query TestUser($id: ID!) { user(id: $id) { id orders { id } reviews { id rating comment createdAt author { id } product { id } } notifications { id title message read createdAt } } }',
    variables: { id: 'u1' },
    assertions: [
      { path: 'data.user.id', operator: 'equals', expected: 'u1' },
      ...[
        'orders.0.id',
        'reviews.0.id',
        'reviews.0.rating',
        'reviews.0.comment',
        'reviews.0.createdAt',
        'reviews.0.author.id',
        'reviews.0.product.id',
        'notifications.0.id',
        'notifications.0.title',
        'notifications.0.message',
        'notifications.0.read',
        'notifications.0.createdAt',
      ].map((path) => ({ path: `data.user.${path}`, operator: 'exists' as const })),
    ],
  },
  {
    id: 'demo-filter',
    name: 'Фильтрация · точная выборка цены',
    query: 'query TestFilter { products(filter: {minPrice: 200}) { id price } }',
    assertions: [
      { path: 'data.products', operator: 'minLength', expected: 1 },
      { path: 'data.products.0.id', operator: 'equals', expected: 'p1' },
      { path: 'data.products.0.price', operator: 'equals', expected: 249 },
    ],
  },
  {
    id: 'demo-pagination',
    name: 'Пагинация · limit и offset',
    query: 'query TestPagination { users(limit: 1, offset: 1) { id name } }',
    assertions: [
      { path: 'data.users', operator: 'equals', expected: [{ id: 'u2', name: 'Марк Волков' }] },
      { path: 'data.users.0.id', operator: 'equals', expected: 'u2' },
    ],
  },
  {
    id: 'demo-analytics',
    name: 'Аналитика · агрегаты бизнес-данных',
    query:
      'query TestAnalytics { analytics { revenue orderCount userCount productCount averageOrderValue conversionRate } categories { id name slug description } suppliers { id name country leadTimeDays rating } }',
    assertions: [
      { path: 'data.analytics.revenue', operator: 'equals', expected: 537 },
      { path: 'data.analytics.orderCount', operator: 'equals', expected: 3 },
      { path: 'data.analytics.userCount', operator: 'equals', expected: 3 },
      { path: 'data.analytics.productCount', operator: 'equals', expected: 4 },
      { path: 'data.analytics.averageOrderValue', operator: 'equals', expected: 268.5 },
      { path: 'data.analytics.conversionRate', operator: 'exists' },
      ...['id', 'name', 'slug', 'description'].map((path) => ({
        path: `data.categories.0.${path}`,
        operator: 'exists' as const,
      })),
      ...['id', 'name', 'country', 'leadTimeDays', 'rating'].map((path) => ({
        path: `data.suppliers.0.${path}`,
        operator: 'exists' as const,
      })),
    ],
  },
  {
    id: 'demo-error',
    name: 'Контролируемая ошибка платёжного сервиса',
    query: 'query TestExpectedError { unstablePayment { id } }',
    expectedError: true,
    assertions: [
      { path: 'errors.0.extensions.code', operator: 'equals', expected: 'PAYMENT_PROVIDER_UNAVAILABLE' },
    ],
  },
];
export function getPath(data: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce(
      (o: any, key) => (o != null && Object.prototype.hasOwnProperty.call(o, key) ? o[key] : undefined),
      data,
    );
}
export function assertResponse(body: unknown, assertion: Assertion): AssertionResult {
  const actual = getPath(body, assertion.path);
  const passed =
    assertion.operator === 'exists'
      ? actual !== undefined && actual !== null
      : assertion.operator === 'equals'
        ? actual !== undefined &&
          assertion.expected !== undefined &&
          isDeepStrictEqual(actual, assertion.expected)
        : (Array.isArray(actual) || typeof actual === 'string') &&
          typeof assertion.expected === 'number' &&
          Number.isInteger(assertion.expected) &&
          assertion.expected >= 0 &&
          actual.length >= assertion.expected;
  return { ...assertion, passed };
}
export function verifiedPaths(paths: Record<string, string>, assertions: AssertionResult[], body: unknown) {
  const matched = new Set<string>();
  for (const a of assertions.filter((a) => a.passed && a.path.startsWith('data.'))) {
    const clean = a.path
      .replace(/^data\./, '')
      .split('.')
      .filter((p) => !/^\d+$/.test(p))
      .join('.');
    for (const [path, coord] of Object.entries(paths))
      if (
        (clean === path || clean.startsWith(path + '.')) &&
        getPath(body, a.path) !== null &&
        getPath(body, a.path) !== undefined
      )
        matched.add(coord);
  }
  return [...matched];
}
const running = new Set<string>();
async function runTestsImpl(projectId: string, caseId?: string): Promise<TestRun> {
  if (running.has(projectId)) throw new APIError(409, 'Набор тестов уже выполняется', 'RUN_IN_PROGRESS');
  running.add(projectId);
  try {
    const { rows } = await pool.query('SELECT definition FROM test_cases WHERE project_id=$1 ORDER BY id', [
      projectId,
    ]);
    const cases: TestCase[] = rows.map((r) => r.definition).filter((t) => !caseId || t.id === caseId);
    if (!cases.length) throw new APIError(404, 'Тесты не найдены', 'NOT_FOUND');
    const before = (await analytics(projectId)).metrics.verifiedCoverage;
    const schema = await getSchema(projectId);
    const results: TestResult[] = [];
    for (const test of cases) {
      const started = performance.now();
      try {
        const res = await proxy(
          projectId,
          { query: test.query, variables: test.variables },
          { origin: 'test' },
        );
        const assertions = test.assertions.map((a) => assertResponse(res.body, a));
        const transport = res.status >= 200 && res.status < 300;
        const graphql = test.expectedError ? !!res.body?.errors?.length : !res.body?.errors?.length;
        const sameSchema = res.event.schemaId === schema.id;
        const passed =
          sameSchema && transport && graphql && assertions.length > 0 && assertions.every((a) => a.passed);
        const fields =
          passed && !test.expectedError ? verifiedPaths(res.analysis.paths, assertions, res.body) : [];
        results.push({
          id: randomUUID(),
          caseId: test.id,
          name: test.name,
          passed,
          duration: Math.round(performance.now() - started),
          assertions,
          verifiedFields: fields,
          ...(!passed
            ? {
                error: !assertions.length
                  ? 'Нет assertions: тест не подтверждает покрытие'
                  : !transport
                    ? `HTTP ${res.status}`
                    : !graphql
                      ? 'Неожиданный GraphQL error status'
                      : 'Assertion failed',
              }
            : {}),
        });
      } catch (error) {
        results.push({
          id: randomUUID(),
          caseId: test.id,
          name: test.name,
          passed: false,
          duration: Math.round(performance.now() - started),
          assertions: [],
          verifiedFields: [],
          error: error instanceof Error ? error.message : 'Test failed',
        });
      }
    }
    const id = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO test_runs(id,project_id,schema_id,results,before_coverage,after_coverage) VALUES($1,$2,$3,$4,$5,$5)',
        [id, projectId, schema.id, JSON.stringify(results), before],
      );
      for (const test of results)
        for (const coordinate of test.verifiedFields)
          await client.query(
            'INSERT INTO verified_fields(project_id,schema_id,coordinate,case_id,run_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,schema_id,coordinate,case_id) DO UPDATE SET run_id=EXCLUDED.run_id',
            [projectId, schema.id, coordinate, test.caseId, id],
          );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const after = (await analytics(projectId)).metrics.verifiedCoverage;
    await pool.query('UPDATE test_runs SET after_coverage=$1 WHERE id=$2', [after, id]);
    announce(projectId, 'tests', { id });
    return {
      id,
      createdAt: new Date().toISOString(),
      results,
      passed: results.filter((t) => t.passed).length,
      failed: results.filter((t) => !t.passed).length,
      before,
      after,
    };
  } finally {
    running.delete(projectId);
  }
}

export const runTests = (projectId: string, caseId?: string) =>
  withProjectMutation(projectId, () => runTestsImpl(projectId, caseId));
