import { resolveCapture } from './captures.js';
import { configuredUpstreamHeaders } from './upstream.js';
import { withProjectActivity } from './locks.js';
import { randomUUID } from 'node:crypto';
import { buildSchema } from 'graphql';
import { analyze } from './analysis.js';
import { getProject, getSchema, saveEvent, APIError } from './store.js';
import { announce } from './live.js';
import type { RequestEvent, Origin } from '../../../packages/shared/src/index.js';
export interface GraphQLBody {
  query: string;
  variables?: Record<string, unknown>;
  operationName?: string;
  extensions?: Record<string, unknown>;
}
async function proxyImpl(
  projectId: string,
  body: GraphQLBody,
  options: {
    origin?: Origin;
    captureToken?: string;
    method?: 'GET' | 'POST';
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
) {
  const project = await getProject(projectId);
  const schema = await getSchema(projectId);
  const captureId = options.captureToken
    ? await resolveCapture(projectId, schema.id, options.captureToken)
    : null;
  const analysis = analyze(buildSchema(schema.sdl), body.query, body.variables, body.operationName);
  if (analysis.type === 'subscription')
    throw new APIError(400, 'Subscriptions не поддерживаются HTTP proxy.', 'UNSUPPORTED_TRANSPORT');
  if (options.method === 'GET' && analysis.type === 'mutation')
    throw new APIError(405, 'Mutation требует POST.', 'METHOD_NOT_ALLOWED');
  const started = performance.now();
  let status: number;
  let responseText = '';
  let contentType: string;
  let responseBody: any;
  let errors: RequestEvent['errors'] = [];
  try {
    const target = new URL(project.upstream);
    let requestBody: string | undefined;
    if (options.method === 'GET') {
      target.searchParams.set('query', body.query);
      if (body.variables) target.searchParams.set('variables', JSON.stringify(body.variables));
      if (body.operationName) target.searchParams.set('operationName', body.operationName);
      if (body.extensions) target.searchParams.set('extensions', JSON.stringify(body.extensions));
    } else requestBody = JSON.stringify(body);
    const res = await fetch(target, {
      method: options.method || 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/graphql-response+json, application/json',
        ...configuredUpstreamHeaders(project.upstream),
        ...options.headers,
      },
      body: requestBody,
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
      redirect: 'error',
    });
    status = res.status;
    contentType = res.headers.get('content-type') || 'application/json';
    if (res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 5 * 1024 * 1024) {
          await reader.cancel();
          throw new APIError(502, 'Upstream response exceeds 5 MiB limit', 'UPSTREAM_RESPONSE_TOO_LARGE');
        }
        chunks.push(part.value);
      }
      responseText = Buffer.concat(chunks).toString('utf8');
    }
    try {
      responseBody = JSON.parse(responseText);
    } catch {}
    if (Array.isArray(responseBody?.errors))
      errors = responseBody.errors.map((e: any) => ({
        message: 'GraphQL operation error',
        path: Array.isArray(e.path) ? e.path : undefined,
        code:
          typeof e.extensions?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(e.extensions.code)
            ? e.extensions.code
            : 'GRAPHQL_ERROR',
      }));
    const validGraphQLResponse =
      responseBody &&
      typeof responseBody === 'object' &&
      !Array.isArray(responseBody) &&
      (Object.prototype.hasOwnProperty.call(responseBody, 'data') ||
        (Array.isArray(responseBody.errors) && responseBody.errors.length > 0));
    if (res.ok && !validGraphQLResponse)
      errors = [
        { message: 'Upstream returned an invalid GraphQL response', code: 'INVALID_UPSTREAM_RESPONSE' },
      ];
    if (!res.ok && !errors.length) errors = [{ message: `Upstream HTTP ${status}`, code: 'HTTP_ERROR' }];
  } catch (error) {
    const timeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    const cancelled = options.signal?.aborted === true;
    status = cancelled ? 499 : timeout ? 504 : 502;
    responseBody = {
      errors: [
        {
          message: cancelled
            ? 'Client cancelled request'
            : error instanceof APIError
              ? error.message
              : timeout
                ? 'Upstream request timed out'
                : 'Upstream unavailable',
          extensions: {
            code: cancelled
              ? 'CLIENT_CANCELLED'
              : error instanceof APIError
                ? error.code
                : timeout
                  ? 'UPSTREAM_TIMEOUT'
                  : 'UPSTREAM_UNAVAILABLE',
          },
        },
      ],
    };
    responseText = JSON.stringify(responseBody);
    contentType = 'application/json';
    errors = [{ message: responseBody.errors[0].message, code: responseBody.errors[0].extensions.code }];
  }
  const event: RequestEvent = {
    id: randomUUID(),
    projectId,
    schemaId: schema.id,
    createdAt: new Date().toISOString(),
    operationName: analysis.name,
    operationType: analysis.type,
    duration: Math.round((performance.now() - started) * 100) / 100,
    status,
    origin: captureId ? 'test' : options.origin || 'live',
    captureId,
    fields: analysis.fields,
    query: analysis.safeQuery,
    errors,
    fingerprint: analysis.fingerprint,
    analysisError: analysis.error,
  };
  await saveEvent(event);
  announce(projectId, 'request', { id: event.id, fields: event.fields });
  return { status, text: responseText, contentType, body: responseBody, event, analysis };
}

export const proxy = (projectId: string, body: GraphQLBody, options: Parameters<typeof proxyImpl>[2] = {}) =>
  withProjectActivity(projectId, () => proxyImpl(projectId, body, options));
