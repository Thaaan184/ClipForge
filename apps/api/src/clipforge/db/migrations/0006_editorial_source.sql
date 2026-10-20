-- Migration 0006: Editorial Source storage for v3 Studio

ALTER TABLE clips ADD COLUMN editorial_source_path TEXT DEFAULT NULL;
ALTER TABLE clips ADD COLUMN editorial_source_meta_json TEXT DEFAULT NULL;

ALTER TABLE finished_clips ADD COLUMN editorial_source_path TEXT DEFAULT NULL;
ALTER TABLE finished_clips ADD COLUMN editorial_source_meta_json TEXT DEFAULT NULL;
