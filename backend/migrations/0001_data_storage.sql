PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL,
  name TEXT NOT NULL,
  data_json TEXT,
  snapshot_kv_key TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (data_json IS NOT NULL OR snapshot_kv_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON projects (user_token, updated_at DESC);

CREATE TABLE IF NOT EXISTS projects_nodes (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  user_token TEXT NOT NULL,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_nodes_user_project
  ON projects_nodes (user_token, project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_user_updated
  ON assets (user_token, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_project
  ON assets (project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  user_token TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_user_updated
  ON history (user_token, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_project
  ON history (project_id, updated_at DESC);
