PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_invites (
  code TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  user_id TEXT UNIQUE,
  image_limit INTEGER NOT NULL CHECK (image_limit >= 0),
  video_seconds_limit INTEGER NOT NULL CHECK (video_seconds_limit >= 0),
  text_tokens_limit INTEGER NOT NULL CHECK (text_tokens_limit >= 0),
  audio_characters_limit INTEGER NOT NULL CHECK (audio_characters_limit >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_users (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (invite_code) REFERENCES account_invites(code)
);

CREATE TABLE IF NOT EXISTS account_devices (
  device_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_account_devices_user
  ON account_devices (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS account_usage (
  user_id TEXT PRIMARY KEY,
  image_count INTEGER NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  video_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_seconds >= 0),
  text_tokens INTEGER NOT NULL DEFAULT 0 CHECK (text_tokens >= 0),
  audio_characters INTEGER NOT NULL DEFAULT 0 CHECK (audio_characters >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
);
