-- Projects: the latest version number points into project_version
create table project (
  id text primary key,
  name text not null,
  owner_id text not null references "user" (id) on delete cascade,
  head_version integer not null default 0,
  -- Which model config the project uses (owned by the owner); shared by everyone with edit access
  model_config_id text references model_config (id) on delete set null,
  thumbnail text,
  created_at integer not null,
  updated_at integer not null
);
create index project_owner_idx on project (owner_id, updated_at);

-- Each save stores a full version that can be viewed and restored
create table project_version (
  project_id text not null references project (id) on delete cascade,
  version integer not null,
  content text not null,
  author_id text references "user" (id) on delete set null,
  summary text,
  created_at integer not null,
  primary key (project_id, version)
);

-- Members and permissions: owner / editor / commenter / viewer
create table project_member (
  project_id text not null references project (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  created_at integer not null,
  primary key (project_id, user_id)
);
create index project_member_user_idx on project_member (user_id);

-- Share links: anyone with the link joins with its role; revocable at any time
create table share_link (
  token text primary key,
  project_id text not null references project (id) on delete cascade,
  role text not null check (role in ('editor', 'commenter', 'viewer')),
  created_by text not null references "user" (id) on delete cascade,
  created_at integer not null,
  revoked_at integer
);
create index share_link_project_idx on share_link (project_id);

-- Invites: by email; the invitee joins automatically after signing in
create table invite (
  id text primary key,
  project_id text not null references project (id) on delete cascade,
  email text not null,
  role text not null check (role in ('editor', 'commenter', 'viewer')),
  created_by text not null references "user" (id) on delete cascade,
  created_at integer not null,
  accepted_at integer
);
create index invite_email_idx on invite (email);

-- Comments: attached to an object (target_id); can be replied to and resolved
create table comment (
  id text primary key,
  project_id text not null references project (id) on delete cascade,
  target_id text,
  target_name text,
  parent_id text references comment (id) on delete cascade,
  author_id text references "user" (id) on delete set null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'pending-confirm')),
  created_at integer not null
);
create index comment_project_idx on comment (project_id, created_at);

-- User-supplied model configs: keys are AES-GCM encrypted and decrypted only on the server
create table model_config (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  label text not null,
  provider text not null,
  model text not null,
  base_url text,
  key_ciphertext text not null,
  key_iv text not null,
  key_hint text not null,
  created_at integer not null
);
create index model_config_user_idx on model_config (user_id);

-- Usage: recorded per user and per project
create table usage (
  id integer primary key autoincrement,
  user_id text not null references "user" (id) on delete cascade,
  project_id text references project (id) on delete set null,
  model_config_id text references model_config (id) on delete set null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at integer not null
);
create index usage_project_idx on usage (project_id, created_at);
create index usage_user_idx on usage (user_id, created_at);

-- Chat history: one row per user per project
create table chat_thread (
  project_id text not null references project (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  messages text not null,
  updated_at integer not null,
  primary key (project_id, user_id)
);
