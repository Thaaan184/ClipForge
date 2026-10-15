-- Migration 0004: Freeform Scene Graphs and Render Mode

ALTER TABLE candidates ADD COLUMN render_mode TEXT NOT NULL DEFAULT 'preset';

CREATE TABLE IF NOT EXISTS scene_graphs (
    candidate_id TEXT PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
    job_id       TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    scene_json   TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scene_graphs_job_id ON scene_graphs(job_id);

ALTER TABLE clips ADD COLUMN scene_json TEXT DEFAULT NULL;
ALTER TABLE finished_clips ADD COLUMN scene_json TEXT DEFAULT NULL;
