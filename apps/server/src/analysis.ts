import {
  buildSchema,
  parse,
  print,
  visit,
  Kind,
  getOperationAST,
  getVariableValues,
  getNamedType,
  isObjectType,
  isInterfaceType,
  isUnionType,
  isCompositeType,
  isInputObjectType,
  valueFromASTUntyped,
  validate,
  findBreakingChanges,
  findDangerousChanges,
  type GraphQLSchema,
  type SelectionSetNode,
  type GraphQLCompositeType,
  type FragmentDefinitionNode,
  type ValueNode,
  type GraphQLType,
} from 'graphql';
import { createHash } from 'node:crypto';
import type {
  SchemaInfo,
  SchemaField,
  FieldStat,
  Finding,
  Change,
  RequestEvent,
} from '../../../packages/shared/src/index.js';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function describeSchema(sdl: string, id = '', createdAt = new Date().toISOString()): SchemaInfo {
  const schema = buildSchema(sdl);
  const fields: SchemaField[] = [];
  const types: SchemaInfo['types'] = [];
  for (const type of Object.values(schema.getTypeMap())) {
    if (type.name.startsWith('__') || (!isObjectType(type) && !isInterfaceType(type) && !isUnionType(type)))
      continue;
    types.push({
      name: type.name,
      kind: isInterfaceType(type) ? 'interface' : isUnionType(type) ? 'union' : 'object',
      description: type.description ?? null,
      possibleTypes:
        isInterfaceType(type) || isUnionType(type) ? schema.getPossibleTypes(type).map((t) => t.name) : [],
    });
    if (!isObjectType(type) && !isInterfaceType(type)) continue;
    for (const f of Object.values(type.getFields()))
      fields.push({
        coordinate: `${type.name}.${f.name}`,
        typeName: type.name,
        name: f.name,
        type: String(f.type),
        target: getNamedType(f.type).name,
        deprecated: f.deprecationReason ?? null,
        args: f.args.map((a) => ({
          name: a.name,
          type: String(a.type),
          required: String(a.type).endsWith('!') && a.defaultValue === undefined,
        })),
      });
  }
  return { id, sdl, createdAt, fields, types };
}
export interface SelectionAnalysis {
  fields: string[];
  paths: Record<string, string>;
  name: string;
  type: string;
  safeQuery: string;
  fingerprint: string;
  error: string | null;
}
export function analyze(
  schema: GraphQLSchema,
  query: string,
  variables: Record<string, unknown> = {},
  operationName?: string,
): SelectionAnalysis {
  const empty: SelectionAnalysis = {
    fields: [],
    paths: {},
    name: operationName || 'Anonymous',
    type: 'unknown',
    safeQuery: '[unparseable GraphQL document]',
    fingerprint: hash(query),
    error: null,
  };
  try {
    const doc = parse(query, { maxTokens: 20000 });
    const safe = visit(doc, {
      StringValue: () => ({ kind: Kind.STRING, value: '[redacted]' }),
      IntValue: () => ({ kind: Kind.INT, value: '0' }),
      FloatValue: () => ({ kind: Kind.FLOAT, value: '0.0' }),
      EnumValue: () => ({ kind: Kind.ENUM, value: 'REDACTED' }),
    });
    empty.safeQuery = print(safe);
    empty.fingerprint = hash(empty.safeQuery);
    const op = getOperationAST(doc, operationName);
    if (!op) throw new Error('Specify operationName for a document with multiple operations.');
    empty.name = op.name?.value || 'Anonymous';
    empty.type = op.operation;
    const validation = validate(schema, doc);
    if (validation.length) throw new Error('GraphQL validation failed');
    const variableResult = getVariableValues(schema, op.variableDefinitions || [], variables, {
      maxErrors: 20,
    });
    if (variableResult.errors) throw new Error('GraphQL variable coercion failed');
    const vars = variableResult.coerced;
    const fragments = new Map(
      doc.definitions
        .filter((d): d is FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION)
        .map((f) => [f.name.value, f]),
    );
    const fields = new Set<string>();
    const paths: Record<string, string> = {};
    const ambiguousPaths = new Set<string>();
    const include = (
      directives:
        | readonly {
            name: { value: string };
            arguments?: readonly { name: { value: string }; value: ValueNode }[];
          }[]
        | undefined,
    ) =>
      !(directives || []).some((d) => {
        const arg = d.arguments?.find((a) => a.name.value === 'if');
        const val = arg ? valueFromASTUntyped(arg.value, vars) : undefined;
        return (d.name.value === 'skip' && val === true) || (d.name.value === 'include' && val === false);
      });
    const walk = (
      set: SelectionSetNode,
      parent: GraphQLCompositeType,
      path: string[],
      seen: Set<string>,
      depth = 0,
    ) => {
      if (depth > 100) throw new Error('Selection depth limit exceeded');
      for (const selection of set.selections) {
        if (!include(selection.directives)) continue;
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value.startsWith('__')) continue;
          if (!isObjectType(parent) && !isInterfaceType(parent)) continue;
          const f = parent.getFields()[selection.name.value];
          if (!f) continue;
          const coord = `${parent.name}.${f.name}`;
          const next = [...path, selection.alias?.value || f.name];
          fields.add(coord);
          const responsePath = next.join('.');
          if (paths[responsePath] && paths[responsePath] !== coord) {
            delete paths[responsePath];
            ambiguousPaths.add(responsePath);
          }
          if (!ambiguousPaths.has(responsePath)) paths[responsePath] = coord;
          const target = getNamedType(f.type);
          if (selection.selectionSet && isCompositeType(target))
            walk(selection.selectionSet, target, next, seen, depth + 1);
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          const t = selection.typeCondition ? schema.getType(selection.typeCondition.name.value) : parent;
          if (t && isCompositeType(t)) walk(selection.selectionSet, t, path, seen, depth + 1);
        } else {
          const name = selection.name.value;
          if (seen.has(name)) continue;
          const f = fragments.get(name);
          if (f && include(f.directives)) {
            const t = schema.getType(f.typeCondition.name.value);
            if (t && isCompositeType(t)) walk(f.selectionSet, t, path, new Set([...seen, name]), depth + 1);
          }
        }
      }
    };
    const root =
      op.operation === 'query'
        ? schema.getQueryType()
        : op.operation === 'mutation'
          ? schema.getMutationType()
          : schema.getSubscriptionType();
    if (root) walk(op.selectionSet, root, [], new Set());
    return { ...empty, fields: [...fields], paths };
  } catch (error) {
    return {
      ...empty,
      fields: [],
      paths: {},
      error:
        error instanceof Error &&
        [
          'Selection depth limit exceeded',
          'GraphQL validation failed',
          'GraphQL variable coercion failed',
          'Specify operationName for a document with multiple operations.',
        ].includes(error.message)
          ? error.message
          : 'GraphQL document could not be analyzed',
    };
  }
}
export function percentile(values: number[], p = 0.95) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}
export const percent = (part: number, total: number) =>
  total ? Math.round((part / total) * 10000) / 100 : 0;
export function scoreField(field: Pick<FieldStat, 'observed' | 'verified' | 'errors' | 'deprecated'>) {
  const reasons: string[] = [];
  let score = 0;
  if (!field.verified) {
    score += field.observed ? Math.min(45, 20 + Math.round(Math.log2(field.observed + 1) * 5)) : 15;
    reasons.push(field.observed ? 'Наблюдалось без подтверждённых тестов' : 'Поле ещё не наблюдалось');
  }
  if (field.errors) {
    score += Math.min(40, 20 + Math.round((field.errors / Math.max(field.observed, 1)) * 20));
    reasons.push(`${field.errors} связанных ошибочных операций`);
  }
  if (field.deprecated && field.observed) {
    score += 25;
    reasons.push('Клиенты используют deprecated-поле');
  }
  return { risk: Math.min(100, score), reasons };
}
export function findings(fields: FieldStat[]): Finding[] {
  return fields
    .filter((f) => f.risk >= 15)
    .map((f): Finding => ({
      id: f.coordinate,
      coordinate: f.coordinate,
      severity: f.risk >= 60 ? 'high' : f.risk >= 30 ? 'medium' : 'low',
      score: f.risk,
      reason: f.reasons.join(' · '),
      recommendation: f.errors
        ? 'Откройте связанные запросы, воспроизведите ошибку и добавьте assertion.'
        : f.deprecated
          ? 'Переведите клиентов на поддерживаемое поле и проверьте совместимость.'
          : 'Добавьте тест с проверкой данных этого поля.',
      observations: f.observed,
      errors: f.errors,
    }))
    .sort((a, b) => b.score - a.score);
}
export function diffSchemas(
  oldSDL: string,
  newSDL: string,
  events: RequestEvent[] = [],
  verified: { coordinate: string; caseId: string }[] = [],
): Change[] {
  const old = buildSchema(oldSDL),
    next = buildSchema(newSDL);
  const description = describeSchema(oldSDL);
  const coordinates = description.fields.map((f) => f.coordinate).sort((a, b) => b.length - a.length);
  const typeNames = Object.values(old.getTypeMap())
    .filter((t) => !t.name.startsWith('__'))
    .map((t) => t.name)
    .sort((a, b) => b.length - a.length);
  const inputDependsOn = (type: GraphQLType, name: string, seen = new Set<string>()): boolean => {
    const named = getNamedType(type);
    if (named.name === name) return true;
    if (!isInputObjectType(named) || seen.has(named.name)) return false;
    return Object.values(named.getFields()).some((field) =>
      inputDependsOn(field.type, name, new Set([...seen, named.name])),
    );
  };
  return [
    ...findBreakingChanges(old, next).map((c) => ({ ...c, severity: 'breaking' as const })),
    ...findDangerousChanges(old, next).map((c) => ({ ...c, severity: 'dangerous' as const })),
  ].map((c) => {
    const coordinate = coordinates.find((coord) => c.description.includes(coord)) ?? null;
    // graphql-js supplies semantic changes. Match its schema identifiers, then follow
    // actual output/argument type dependencies (including nested input objects).
    const words = new Set(c.description.split(/[^_0-9A-Za-z]+/));
    const typeName = !coordinate
      ? typeNames
          .filter((name) => words.has(name))
          .sort((a, b) => c.description.indexOf(a) - c.description.indexOf(b) || b.length - a.length)[0]
      : undefined;
    const affectedCoordinates = coordinate
      ? [coordinate]
      : typeName
        ? description.fields
            .filter((field) => {
              if (field.typeName === typeName || field.target === typeName) return true;
              const parent = old.getType(field.typeName);
              return (
                (isObjectType(parent) || isInterfaceType(parent)) &&
                parent.getFields()[field.name].args.some((arg) => inputDependsOn(arg.type, typeName))
              );
            })
            .map((field) => field.coordinate)
        : [];
    const affectedSet = new Set(affectedCoordinates);
    const affected = events.filter((e) => e.fields.some((field) => affectedSet.has(field)));
    const counts = new Map<string, { name: string; requests: number; fingerprint: string }>();
    affected.forEach((e) => {
      const existing = counts.get(e.fingerprint) || {
        name: e.operationName,
        requests: 0,
        fingerprint: e.fingerprint,
      };
      existing.requests++;
      counts.set(e.fingerprint, existing);
    });
    return {
      ...c,
      coordinate,
      affectedCoordinates,
      impactBasis: coordinate ? 'field selections' : typeName ? 'type dependencies' : 'unmapped',
      operations: [...counts.values()],
      observedRequests: affected.length,
      testIds: [...new Set(verified.filter((v) => affectedSet.has(v.coordinate)).map((v) => v.caseId))],
    };
  });
}
