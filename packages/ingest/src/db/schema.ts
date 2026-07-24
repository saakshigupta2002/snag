/**
 * Snag schema. Idempotent: applied on every boot (CREATE TABLE IF NOT EXISTS).
 * Kept as a TS module (not a .sql file) so serverless bundlers can inline it.
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_key TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- id = '<project_id>:<client_session_id>' so client ids can't collide across projects.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT,
  url_first TEXT,
  device TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','processed')),
  event_count INTEGER NOT NULL DEFAULT 0,
  referrer TEXT,
  pageviews INTEGER,
  entry_page TEXT,
  exit_page TEXT,
  js_errors INTEGER,
  max_scroll_pct INTEGER,
  duration_ms INTEGER,
  browser TEXT,
  os TEXT,
  is_bot BOOLEAN,
  lcp_ms INTEGER,
  inp_ms INTEGER,
  cls REAL,
  visitor_id TEXT,
  country TEXT
);
CREATE INDEX IF NOT EXISTS sessions_project_idx ON sessions (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sessions_status_idx ON sessions (status, last_seen_at);
-- Analytics columns for already-provisioned databases (idempotent).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pageviews INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS entry_page TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS exit_page TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS js_errors INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS max_scroll_pct INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS browser TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS os TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_bot BOOLEAN;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS lcp_ms INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS inp_ms INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cls REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS visitor_id TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS country TEXT;
CREATE INDEX IF NOT EXISTS sessions_visitor_idx ON sessions (project_id, visitor_id);

-- Ordered chunks of rrweb events (a batch = a chunk), not one row per event.
CREATE TABLE IF NOT EXISTS event_chunks (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq_from INTEGER NOT NULL,
  seq_to INTEGER NOT NULL,
  events JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_chunks_session_idx ON event_chunks (session_id, seq_from);

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  detector TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  ts_start BIGINT NOT NULL,
  ts_end BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','dismissed')),
  group_key TEXT NOT NULL,
  title TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  occurrences INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issues_project_group_idx ON issues (project_id, group_key);
CREATE INDEX IF NOT EXISTS issues_project_status_idx ON issues (project_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS flag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  detector TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('builtin','custom_mechanical','custom_ai')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  params JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, detector)
);

CREATE TABLE IF NOT EXISTS ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  summary TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, group_key)
);
CREATE INDEX IF NOT EXISTS ai_analyses_created_idx ON ai_analyses (created_at);

CREATE TABLE IF NOT EXISTS issue_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  action TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS issue_notes_group_idx ON issue_notes (project_id, group_key, created_at DESC);
`;
