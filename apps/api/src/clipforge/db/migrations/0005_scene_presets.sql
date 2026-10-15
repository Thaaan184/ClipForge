-- Migration 0005: Scene Presets (Reusable Freeform Layouts)

CREATE TABLE IF NOT EXISTS scene_presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_presets_name ON scene_presets(name);
