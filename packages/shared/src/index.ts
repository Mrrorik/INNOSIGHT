export type Origin = 'demo' | 'live' | 'test';
export interface SchemaField {
  coordinate: string;
  typeName: string;
  name: string;
  type: string;
  target: string;
  deprecated: string | null;
  args: { name: string; type: string; required: boolean }[];
}
export interface SchemaInfo {
  id: string;
  sdl: string;
  createdAt: string;
  fields: SchemaField[];
  types: { name: string; kind: string; description: string | null; possibleTypes: string[] }[];
}
export interface Project {
  id: string;
  name: string;
  description: string;
  upstream: string;
  demo: boolean;
  createdAt: string;
}
export interface RequestEvent {
  id: string;
  projectId: string;
  schemaId: string;
  createdAt: string;
  operationName: string;
  operationType: string;
  duration: number;
  status: number;
  origin: Origin;
  fields: string[];
  query: string;
  errors: { message: string; path?: Array<string | number>; code?: string }[];
  fingerprint: string;
  analysisError: string | null;
  captureId?: string | null;
}
export interface FieldStat extends SchemaField {
  observed: number;
  errors: number;
  verified: boolean;
  testIds: string[];
  risk: number;
  reasons: string[];
}
export interface TimelinePoint {
  time: string;
  requests: number;
  errors: number;
  latency: number;
  coverage: number;
}
export interface Metrics {
  total: number;
  observed: number;
  verified: number;
  selectionCoverage: number;
  verifiedCoverage: number;
  requests: number;
  errors: number;
  errorRate: number;
  averageLatency: number;
  p95Latency: number;
  unobserved: number;
  successfulTests: number;
}
export interface Finding {
  id: string;
  coordinate: string;
  severity: 'high' | 'medium' | 'low';
  score: number;
  reason: string;
  recommendation: string;
  observations: number;
  errors: number;
}
export interface Assertion {
  path: string;
  operator: 'exists' | 'equals' | 'minLength';
  expected?: unknown;
}
export interface TestCase {
  id: string;
  name: string;
  query: string;
  variables?: Record<string, unknown>;
  assertions: Assertion[];
  expectedError?: boolean;
}
export interface AssertionResult extends Assertion {
  passed: boolean;
  actual?: unknown;
}
export interface TestResult {
  id: string;
  caseId: string;
  name: string;
  passed: boolean;
  duration: number;
  assertions: AssertionResult[];
  verifiedFields: string[];
  error?: string;
}
export interface TestRun {
  id: string;
  createdAt: string;
  results: TestResult[];
  passed: number;
  failed: number;
  before: number;
  after: number;
}
export interface Change {
  type: string;
  description: string;
  severity: 'breaking' | 'dangerous';
  coordinate: string | null;
  affectedCoordinates: string[];
  impactBasis: 'field selections' | 'type dependencies' | 'unmapped';
  operations: { name: string; requests: number; fingerprint: string }[];
  testIds: string[];
  observedRequests: number;
}
export interface Analytics {
  project: Project;
  schema: SchemaInfo;
  metrics: Metrics;
  fields: FieldStat[];
  timeline: TimelinePoint[];
  operations: {
    fingerprint: string;
    name: string;
    type: string;
    requests: number;
    errors: number;
    latency: number;
    fields: string[];
  }[];
  latencyDistribution: { bucket: string; count: number }[];
  errorBreakdown: { name: string; count: number }[];
  risks: Finding[];
  recent: RequestEvent[];
  testRuns: TestRun[];
  changes: Change[];
  snapshots: {
    id: string;
    createdAt: string;
    label: string;
    selectionCoverage: number;
    verifiedCoverage: number;
    schemaId: string;
  }[];
}
export const METHODOLOGY =
  'Selection coverage = unique selected object/interface output fields in valid observed operations / current schema output fields. Introspection and input fields excluded. Directives use supplied and default variables. Abstract branches are possible selections, not resolver execution. Verified coverage = fields on successful assertion paths in registered tests with HTTP success and no GraphQL errors / current schema output fields. Coverage is cumulative for the current schema version; request health uses the selected time range. P95 uses nearest rank.';

export interface CaptureSummary {
  id: string;
  projectId: string;
  schemaId: string;
  label: string;
  createdAt: string;
  finishedAt: string | null;
  requests: number;
  errors: number;
  selectedFields: number;
  totalFields: number;
  selectionCoverage: number;
  selectedTypes: number;
  totalTypes: number;
  typeCoverage: number;
  p95Latency: number;
}
export interface CaptureReport extends CaptureSummary {
  fields: (SchemaField & { requests: number; failed: number; selected: boolean })[];
  types: { name: string; selected: number; total: number; coverage: number }[];
  methodology: string;
}
