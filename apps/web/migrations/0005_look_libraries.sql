-- Look libraries (#81): where looks come from and get reused across designs. Designs keep their own copies; a library look
-- has a version so designs that copied it can be told about updates.
create table look_library (
  id text primary key,
  owner_id text not null references "user" (id) on delete cascade,
  name text not null,
  created_at integer not null,
  updated_at integer not null
);

-- Who can use a library: the owner, editors (add and change looks) and viewers (use them)
create table look_library_member (
  library_id text not null references look_library (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null,
  created_at integer not null,
  primary key (library_id, user_id)
);
create index look_library_member_user_idx on look_library_member (user_id);

-- A look: data is JSON { for, recipe, types? } (types: furniture types the look draws that aren't in the catalog)
create table library_look (
  library_id text not null references look_library (id) on delete cascade,
  look_id text not null,
  name text not null,
  data text not null,
  version integer not null,
  updated_by text,
  updated_at integer not null,
  primary key (library_id, look_id)
);
