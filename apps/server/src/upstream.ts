const allowedHeaders = new Set(['authorization', 'x-api-key', 'accept-language']);
/** Optional credentials live only in the server environment, keyed by exact allowlisted endpoint. */
export function configuredUpstreamHeaders(url: string): Record<string, string> {
  const raw = process.env.UPSTREAM_HEADERS_JSON;
  if (!raw) return {};
  let config: unknown;
  try {
    config = JSON.parse(raw);
  } catch {
    throw new Error('UPSTREAM_HEADERS_JSON must be a valid JSON object.');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('UPSTREAM_HEADERS_JSON must be a valid JSON object.');
  const allowed = (process.env.UPSTREAM_ALLOWLIST || '').split(',').map((s) => s.trim());
  if (!allowed.includes(url)) return {};
  const entry = (config as Record<string, unknown>)[url];
  if (entry === undefined) return {};
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error('Upstream header entry must be an object.');
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(entry)) {
    if (!allowedHeaders.has(name.toLowerCase()) || typeof value !== 'string' || /[\r\n]/.test(value))
      throw new Error('Unsupported configured upstream header.');
    headers[name.toLowerCase()] = value;
  }
  return headers;
}
