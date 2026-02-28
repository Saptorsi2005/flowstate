-- migrations/001_initial.sql
-- FlowState Neon Postgres schema
-- Run once against your Neon database.
-- All writes from the extension are idempotent — safe to re-run.

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_id   TEXT        UNIQUE NOT NULL,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Workspace snapshots ────────────────────────────────────────
-- One row per workspace per user. Upserted on every sync.
CREATE TABLE IF NOT EXISTS workspaces (
  id               UUID        PRIMARY KEY,   -- matches extension ws.id
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  focus_mode       TEXT        NOT NULL DEFAULT 'easy'
                               CHECK (focus_mode IN ('easy', 'strict')),
  blocked_domains  TEXT[]      NOT NULL DEFAULT '{}',
  allowed_domains  TEXT[]      NOT NULL DEFAULT '{}',
  todos_json       JSONB       NOT NULL DEFAULT '[]',
  saved_tabs_count INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Focus sessions ─────────────────────────────────────────────
-- Append-only. One row per completed focus session.
-- `checksum` is the SHA-256 of the sync payload — prevents duplicate inserts.
CREATE TABLE IF NOT EXISTS focus_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id      UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  workspace_name    TEXT,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ,
  elapsed_ms        BIGINT      NOT NULL DEFAULT 0,
  todos_completed   INT         NOT NULL DEFAULT 0,
  todos_total       INT         NOT NULL DEFAULT 0,
  checksum          TEXT        UNIQUE,        -- idempotency key
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Block events ───────────────────────────────────────────────
-- Time-series analytics. One row per block event.
-- Deduplicated by (user_id, domain, occurred_at) to handle duplicate syncs.
CREATE TABLE IF NOT EXISTS block_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID,
  domain       TEXT        NOT NULL,
  block_type   TEXT        NOT NULL DEFAULT 'manual',  -- manual | ai | ai-temp
  focus_mode   TEXT        NOT NULL DEFAULT 'easy',
  occurred_at  TIMESTAMPTZ NOT NULL,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, domain, occurred_at)
);

-- ── Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workspaces_user     ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_time  ON focus_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_block_events_user   ON block_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_block_events_domain ON block_events(user_id, domain);

-- ── Row-Level Security ─────────────────────────────────────────
-- Users can only see their own rows.
-- The API sets `app.current_user_id` via SET LOCAL before each query.
-- (Optional — enable if using Neon direct access from frontend in the future)

-- ALTER TABLE workspaces    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE block_events   ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY user_isolation ON workspaces
--   USING (user_id = current_setting('app.current_user_id')::uuid);
-- CREATE POLICY user_isolation ON focus_sessions
--   USING (user_id = current_setting('app.current_user_id')::uuid);
-- CREATE POLICY user_isolation ON block_events
--   USING (user_id = current_setting('app.current_user_id')::uuid);
