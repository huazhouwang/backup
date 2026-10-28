-- Share pages (issue 196): a design published with its style renders under a revocable token. Unpublishing deletes the row, so
-- the link dies; publishing again makes a new one. Renders marked public show on the page while it is published.
create table showcase (
  token text primary key,
  project_id text not null unique references project (id) on delete cascade,
  created_by text references "user" (id) on delete set null,
  hero text,
  created_at integer not null
);
