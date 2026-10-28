-- Product funnel events (issue 188): how far people get from "new design" to a house they keep working on
create table event (
  id integer primary key autoincrement,
  name text not null,
  user_id text references "user" (id) on delete set null,
  project_id text references project (id) on delete set null,
  detail text,
  created_at integer not null
);
create index event_name_idx on event (name, created_at);
