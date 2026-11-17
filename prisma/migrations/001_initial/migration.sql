CREATE TABLE IF NOT EXISTS projects (
 id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', upstream text NOT NULL,
 demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS schema_versions (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 sdl text NOT NULL, hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,hash)
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active_schema_id text REFERENCES schema_versions(id);
CREATE TABLE IF NOT EXISTS request_events (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 schema_id text REFERENCES schema_versions(id), created_at timestamptz NOT NULL DEFAULT now(),
 operation_name text NOT NULL, operation_type text NOT NULL, duration double precision NOT NULL,
 status integer NOT NULL, origin text NOT NULL CHECK(origin IN ('demo','live','test')),
 fields jsonb NOT NULL DEFAULT '[]', safe_query text NOT NULL, errors jsonb NOT NULL DEFAULT '[]',
 fingerprint text NOT NULL, analysis_error text
);
CREATE INDEX IF NOT EXISTS events_project_time ON request_events(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS events_schema ON request_events(schema_id);
CREATE INDEX IF NOT EXISTS events_fields ON request_events USING gin(fields);
CREATE TABLE IF NOT EXISTS test_cases (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, definition jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS test_runs (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 schema_id text NOT NULL REFERENCES schema_versions(id), created_at timestamptz NOT NULL DEFAULT now(),
 results jsonb NOT NULL, before_coverage double precision NOT NULL, after_coverage double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS tests_project_time ON test_runs(project_id,created_at DESC);
CREATE TABLE IF NOT EXISTS verified_fields (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, schema_id text NOT NULL REFERENCES schema_versions(id),
 coordinate text NOT NULL, case_id text NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
 run_id text NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
 PRIMARY KEY(project_id,schema_id,coordinate,case_id)
);
CREATE TABLE IF NOT EXISTS coverage_snapshots (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 schema_id text NOT NULL REFERENCES schema_versions(id), label text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 selection_coverage double precision NOT NULL, verified_coverage double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS demo_runs (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 scenario text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
