-- Autosaves by the same author within a short window are merged into one version (see saveVersion in src/server/repo.ts).
-- started_at is when the first of the merged saves happened; null for versions that were never merged into.
alter table project_version add column started_at integer;
