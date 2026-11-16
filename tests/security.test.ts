import { describe, it, expect, afterEach } from 'vitest';
import { adminAuthorized, validateUpstream } from '../apps/server/src/app.js';
import { escapeHTML, csv, htmlReport } from '../apps/server/src/reports.js';
import type { Analytics } from '../packages/shared/src/index.js';
const originalToken = process.env.ADMIN_TOKEN,
  originalAllowlist = process.env.UPSTREAM_ALLOWLIST;
afterEach(() => {
  if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = originalToken;
  if (originalAllowlist === undefined) delete process.env.UPSTREAM_ALLOWLIST;
  else process.env.UPSTREAM_ALLOWLIST = originalAllowlist;
});
describe('Administrative configuration security', () => {
  it('external administration is closed when no token is configured', () => {
    delete process.env.ADMIN_TOKEN;
    expect(adminAuthorized('Bearer anything')).toBe(false);
    expect(adminAuthorized(undefined)).toBe(false);
  });
  it('requires the exact configured token with constant-time comparison for equal lengths', () => {
    process.env.ADMIN_TOKEN = 'local-test-token';
    expect(adminAuthorized('Bearer local-test-token')).toBe(true);
    expect(adminAuthorized('Bearer wrong-test-token')).toBe(false);
    expect(adminAuthorized('Bearer local-test-tokeN')).toBe(false);
  });
  it('requires an exact HTTPS upstream URL from a server-controlled allowlist', () => {
    process.env.UPSTREAM_ALLOWLIST = 'https://api.example.test/graphql';
    expect(validateUpstream('https://api.example.test/graphql')).toBe('https://api.example.test/graphql');
    for (const url of [
      'http://api.example.test/graphql',
      'https://api.example.test/other',
      'https://evil.example/graphql',
      'https://api.example.test/graphql?target=http://169.254.169.254',
      'https://user:secret@api.example.test/graphql',
      'https://api.example.test/graphql#fragment',
      'http://127.0.0.1:5000/graphql',
      'http://169.254.169.254/latest/meta-data',
    ])
      expect(() => validateUpstream(url)).toThrow();
  });
  it('rejects unconfigured URLs and malformed input', () => {
    delete process.env.UPSTREAM_ALLOWLIST;
    expect(() => validateUpstream('https://example.test/graphql')).toThrow();
    expect(() => validateUpstream('not a URL')).toThrow();
  });
});
describe('Export safety', () => {
  it('escapes HTML including attribute delimiters', () => {
    expect(escapeHTML('<script>"x"&\'')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;');
  });
  it('escapes persisted project content in printable reports', () => {
    const a = {
      project: { name: '<script>alert(1)</script>' },
      schema: { id: 'test' },
      metrics: { selectionCoverage: 0, verifiedCoverage: 0, requests: 0, errors: 0 },
      risks: [],
      fields: [],
      operations: [],
      changes: [],
    } as unknown as Analytics;
    const report = htmlReport(a);
    expect(report).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(report).not.toContain('<script>alert');
  });
  it('quotes CSV and neutralizes spreadsheet formula prefixes', () => {
    const a = {
      fields: [
        {
          coordinate: '=HYPERLINK("evil")',
          type: 'String',
          observed: 0,
          verified: false,
          errors: 0,
          risk: 15,
        },
      ],
    } as unknown as Analytics;
    const output = csv(a);
    expect(output).toContain('"\'=HYPERLINK(""evil"")"');
  });
});

describe('Exact-endpoint credential routing', () => {
  it('only sends configured headers to the exact allowlisted endpoint', async () => {
    const { configuredUpstreamHeaders } = await import('../apps/server/src/upstream.js');
    const previous = process.env.UPSTREAM_HEADERS_JSON;
    try {
      process.env.UPSTREAM_ALLOWLIST = 'https://api.example.test/graphql';
      process.env.UPSTREAM_HEADERS_JSON = JSON.stringify({
        'https://api.example.test/graphql': { authorization: 'Bearer test-fixture' },
      });
      expect(configuredUpstreamHeaders('https://api.example.test/graphql')).toEqual({
        authorization: 'Bearer test-fixture',
      });
      expect(configuredUpstreamHeaders('https://other.example.test/graphql')).toEqual({});
      expect(configuredUpstreamHeaders('https://api.example.test/other')).toEqual({});
    } finally {
      if (previous === undefined) delete process.env.UPSTREAM_HEADERS_JSON;
      else process.env.UPSTREAM_HEADERS_JSON = previous;
    }
  });
});
