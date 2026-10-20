-- Migration 0007: Editorial Engine Sessions, Versions, Assets, and Messages

CREATE TABLE IF NOT EXISTS editorial_sessions (
    id TEXT PRIMARY KEY,
    clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'EDITORIAL_DRAFT',
    current_version INTEGER NOT NULL DEFAULT 1,
    style_pack TEXT NOT NULL DEFAULT 'gaming_hype',
    workspace_dir TEXT NOT NULL,
    manifest_path TEXT NOT NULL,
    error_message TEXT DEFAULT NULL,
    failed_stage TEXT DEFAULT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editorial_versions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES editorial_sessions(id) ON DELETE CASCADE,
    version_num INTEGER NOT NULL,
    commit_sha TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    preview_path TEXT DEFAULT NULL,
    final_path TEXT DEFAULT NULL,
    qa_json TEXT DEFAULT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(session_id, version_num)
);

CREATE TABLE IF NOT EXISTS editorial_assets (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES editorial_sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    hint TEXT NOT NULL DEFAULT '',
    duration_s REAL DEFAULT 0.0,
    bpm REAL DEFAULT NULL,
    meta_json TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS editorial_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES editorial_sessions(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'chat',
    meta_json TEXT DEFAULT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editorial_sessions_clip_id ON editorial_sessions(clip_id);
CREATE INDEX IF NOT EXISTS idx_editorial_versions_session ON editorial_versions(session_id);
CREATE INDEX IF NOT EXISTS idx_editorial_assets_session ON editorial_assets(session_id);
CREATE INDEX IF NOT EXISTS idx_editorial_messages_session ON editorial_messages(session_id);
