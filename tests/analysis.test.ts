import type { RequestEvent } from '../packages/shared/src/index.js';
import { describe, it, expect } from 'vitest';
import { buildSchema } from 'graphql';
import {
  analyze,
  describeSchema,
  percent,
  percentile,
  scoreField,
  diffSchemas,
} from '../apps/server/src/analysis.js';
import { assertResponse, verifiedPaths } from '../apps/server/src/testing.js';
import { demoSDL, candidateSDL } from '../apps/demo-api/src/schema.js';
const schema = buildSchema(demoSDL);
describe('GraphQL AST selection intelligence', () => {
  it('counts nested fields by schema coordinate, including aliased fields', () => {
    const a = analyze(schema, 'query Shop { catalog: products { label: name category { name } } }');
    expect(a.error).toBeNull();
    expect(a.name).toBe('Shop');
    expect(a.fields.sort()).toEqual(['Category.name', 'Product.category', 'Product.name', 'Query.products']);
    expect(a.paths['catalog.label']).toBe('Product.name');
  });
  it('selects only operationName and handles multiple operations without a name', () => {
    const query = 'query A { users { email } } query B { products { price } }';
    expect(analyze(schema, query, {}, 'B').fields.sort()).toEqual(['Product.price', 'Query.products']);
    expect(analyze(schema, query).fields).toEqual([]);
    expect(analyze(schema, query).error).toMatch(/operationName/);
    expect(analyze(schema, query, {}, 'Missing').error).not.toBeNull();
  });
  it('expands reusable and nested fragments without duplicate counts', () => {
    const a = analyze(
      schema,
      'query { products { ...P ...P } } fragment P on Product { name category { ...C } } fragment C on Category { id name }',
    );
    expect(a.fields.sort()).toEqual([
      'Category.id',
      'Category.name',
      'Product.category',
      'Product.name',
      'Query.products',
    ]);
  });
  it('evaluates directives with supplied and default variable values', () => {
    const q =
      'query D($yes:Boolean! = false) { users @include(if:$yes) { email } products { name price @skip(if:$yes) } }';
    expect(analyze(schema, q).fields.sort()).toEqual(['Product.name', 'Product.price', 'Query.products']);
    expect(analyze(schema, q, { yes: true }).fields.sort()).toEqual([
      'Product.name',
      'Query.products',
      'Query.users',
      'User.email',
    ]);
  });
  it('evaluates directives on fragment spreads and inline fragments', () => {
    const a = analyze(
      schema,
      'query { products { ...P @skip(if:true) ... on Product @include(if:false) { price } id } } fragment P on Product { name }',
    );
    expect(a.fields.sort()).toEqual(['Product.id', 'Query.products']);
  });
  it('records abstract possible selections without claiming runtime execution', () => {
    const a = analyze(
      schema,
      'query { search(term:"a") { ... on User { id email } ... on Product { id name } } node(id:"u1") { id ... on User { name } } }',
    );
    expect(a.fields).toContain('User.email');
    expect(a.fields).toContain('Product.name');
    expect(a.fields).toContain('Node.id');
    expect(a.paths['search.id']).toBeUndefined();
  });
  it('excludes introspection and rejects invalid documents', () => {
    expect(analyze(schema, '{ __schema { types { name } } }').fields).toEqual([]);
    expect(analyze(schema, '{ products { __typename id } }').fields.sort()).toEqual([
      'Product.id',
      'Query.products',
    ]);
    expect(analyze(schema, '{ products { missing } }').fields).toEqual([]);
    expect(analyze(schema, '{ this is malformed').fields).toEqual([]);
  });
  it('never saves literals, variable defaults or invalid raw query contents', () => {
    const a = analyze(
      schema,
      'query Secret($id:ID!="customer-secret") { user(id:$id) { email } products(filter:{minPrice:9876,search:"private-value"}) { price } }',
    );
    expect(a.safeQuery).not.toContain('customer-secret');
    expect(a.safeQuery).not.toContain('private-value');
    expect(a.safeQuery).not.toContain('9876');
    expect(analyze(schema, '{ secret-password').safeQuery).not.toContain('secret-password');
  });
  it('counts object/interface output fields only', () => {
    const s = describeSchema(demoSDL);
    expect(s.fields.length).toBeGreaterThan(50);
    expect(s.fields.some((f) => f.typeName === 'ProductFilter')).toBe(false);
    expect(s.fields.some((f) => f.typeName === 'Node')).toBe(true);
    expect(s.fields.some((f) => f.name.startsWith('__'))).toBe(false);
    expect(s.fields.find((f) => f.coordinate === 'Product.legacyPrice')?.deprecated).toBeTruthy();
  });
});
describe('Coverage and runtime statistics', () => {
  it('uses a single unique field denominator and handles empty schemas', () => {
    expect(percent(25, 99)).toBe(25.25);
    expect(percent(0, 0)).toBe(0);
    expect(percent(3, 4)).toBe(75);
  });
  it('uses nearest-rank P95 including outliers', () => {
    expect(percentile([])).toBe(0);
    expect(percentile([10, 20, 1000])).toBe(1000);
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(95);
  });
  it('risk scoring is deterministic, bounded and explainable', () => {
    const a = scoreField({ observed: 20, verified: false, errors: 4, deprecated: 'legacy' });
    expect(a.risk).toBeGreaterThan(60);
    expect(a.risk).toBeLessThanOrEqual(100);
    expect(a.reasons).toHaveLength(3);
    expect(scoreField({ observed: 20, verified: true, errors: 0, deprecated: null }).risk).toBe(0);
    expect(scoreField({ observed: 0, verified: false, errors: 0, deprecated: null }).risk).toBe(15);
  });
  it('finds semantic breaking changes rather than text formatting changes', () => {
    const changes = diffSchemas(demoSDL, candidateSDL);
    expect(changes.filter((c) => c.severity === 'breaking')).toHaveLength(2);
    expect(changes.map((c) => c.coordinate)).toContain('Product.legacyPrice');
    expect(changes.map((c) => c.coordinate)).toContain('User.email');
    expect(diffSchemas(demoSDL, '\n' + demoSDL + '\n')).toEqual([]);
  });
});
describe('Change Impact follows semantic type dependencies', () => {
  it('maps removed enum values to output fields, argument types and observed operations', () => {
    const old =
      'enum Status { ACTIVE RETIRED } input Filter { status: Status } type Order { id: ID! status: Status! } type Query { orders(filter: Filter): [Order!]! }';
    const next = old.replace('ACTIVE RETIRED', 'ACTIVE');
    const event = {
      operationName: 'Orders',
      fingerprint: 'one',
      fields: ['Query.orders', 'Order.status'],
    } as RequestEvent;
    const change = diffSchemas(old, next, [event], [{ coordinate: 'Order.status', caseId: 'order-test' }])[0];
    expect(change.impactBasis).toBe('type dependencies');
    expect(change.affectedCoordinates.sort()).toEqual(['Order.status', 'Query.orders']);
    expect(change.observedRequests).toBe(1);
    expect(change.testIds).toEqual(['order-test']);
  });
  it('follows nested input object changes back to query arguments', () => {
    const old =
      'input Inner { term: String } input Filter { inner: Inner } type Query { search(filter: Filter): String other: String }';
    const next = old.replace('term: String', 'term: String required: ID!');
    const event = { operationName: 'Search', fingerprint: 'two', fields: ['Query.search'] } as RequestEvent;
    const change = diffSchemas(old, next, [event])[0];
    expect(change.affectedCoordinates).toEqual(['Query.search']);
    expect(change.operations[0].name).toBe('Search');
    expect(change.severity).toBe('breaking');
  });
});
describe('Variable coercion and privacy boundaries', () => {
  it('invalid or missing required variable values cannot add observed fields', () => {
    const q = 'query Var($id:ID!,$yes:Boolean!){user(id:$id){email @include(if:$yes)}}';
    expect(analyze(schema, q, { id: 'u1', yes: 'false' }).fields).toEqual([]);
    expect(analyze(schema, q, {}).fields).toEqual([]);
    expect(analyze(schema, q, { id: 'u1', yes: false }).fields).toEqual(['Query.user']);
  });
  it('syntax errors never persist sensitive tokens from parser error messages', () => {
    const result = analyze(schema, 'query { user("private-parser-token") { id } }');
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('private-parser-token');
  });
});
describe('Assertion evidence', () => {
  it('checks exists, equals and minimum length without coercing equality', () => {
    const body = { data: { users: [{ name: 'Anna', active: false, amount: 0 }] } };
    expect(assertResponse(body, { path: 'data.users.0.active', operator: 'exists' }).passed).toBe(true);
    expect(
      assertResponse(body, { path: 'data.users.0.amount', operator: 'equals', expected: 0 }).passed,
    ).toBe(true);
    expect(assertResponse(body, { path: 'data.users', operator: 'minLength', expected: 1 }).passed).toBe(
      true,
    );
    expect(
      assertResponse(body, { path: 'data.users.0.amount', operator: 'equals', expected: '0' }).passed,
    ).toBe(false);
    expect(assertResponse(body, { path: 'data.users.0.missing', operator: 'equals' }).passed).toBe(false);
  });
  it('does not verify unasserted sibling fields or missing paths', () => {
    const paths = { users: 'Query.users', 'users.name': 'User.name', 'users.email': 'User.email' };
    const body = { data: { users: [{ name: 'Anna', email: 'anna@example.test' }] } };
    expect(
      verifiedPaths(paths, [{ path: 'data.users.0.name', operator: 'exists', passed: true }], body).sort(),
    ).toEqual(['Query.users', 'User.name']);
    expect(
      verifiedPaths(paths, [{ path: 'data.users.999.name', operator: 'equals', passed: true }], body),
    ).toEqual([]);
    expect(verifiedPaths(paths, [], body)).toEqual([]);
  });
  it('null values and error assertions never confirm selected data fields', () => {
    expect(
      verifiedPaths(
        { user: 'Query.user' },
        [{ path: 'data.user', operator: 'equals', expected: null, passed: true }],
        { data: { user: null } },
      ),
    ).toEqual([]);
    expect(
      verifiedPaths(
        { user: 'Query.user' },
        [{ path: 'errors.0.message', operator: 'exists', passed: true }],
        { errors: [{ message: 'err' }] },
      ),
    ).toEqual([]);
  });
});
