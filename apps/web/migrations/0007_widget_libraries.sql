-- Widget libraries (#163): a user's own and shared libraries of canvas widgets, each kept as its library file (data: the
-- *.widgetlib.json content, packages/core/src/widgets/format.ts). Designs copy the widgets they install, so a library changing
-- never changes a design; a newer version is offered instead.
create table widget_library (
  id text primary key,
  owner_id text not null references "user" (id) on delete cascade,
  name text not null,
  data text not null,
  created_at integer not null,
  updated_at integer not null
);

-- Who can use a library: the owner, editors (add and change widgets) and viewers (install them)
create table widget_library_member (
  library_id text not null references widget_library (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null,
  created_at integer not null,
  primary key (library_id, user_id)
);
create index widget_library_member_user_idx on widget_library_member (user_id);
