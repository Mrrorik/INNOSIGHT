CREATE TABLE capture_sessions (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 schema_id text NOT NULL REFERENCES schema_versions(id),
 label text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX captures_project_time ON capture_sessions(project_id,created_at DESC);
ALTER TABLE request_events ADD COLUMN capture_id text REFERENCES capture_sessions(id) ON DELETE SET NULL;
CREATE INDEX events_capture ON request_events(capture_id) WHERE capture_id IS NOT NULL;
