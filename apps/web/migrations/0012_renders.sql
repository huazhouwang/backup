-- Style renders (issue 195): images of a design in a style, made by an image model from passes of the 3D model. Kept as data
-- URLs (small enough on the free plan); `source` is the clean colour pass the render started from, for before/after.
create table render (
  id text primary key,
  project_id text not null references project (id) on delete cascade,
  user_id text references "user" (id) on delete set null,
  style text not null,
  style_name text not null,
  shot text not null,
  shot_name text not null,
  provider text not null,
  image text not null,
  source text not null,
  public integer not null default 0,
  created_at integer not null
);
create index render_project_idx on render (project_id, created_at);
