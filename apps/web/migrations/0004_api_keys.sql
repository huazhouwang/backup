-- API keys are saved once per provider; model_config becomes a model picked for a key, so one key can serve several models.
-- Keys are encrypted with their row id as associated data, so each existing config's key moves to an api_key row with the same id.
create table api_key (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  provider text not null,
  base_url text,
  key_ciphertext text not null,
  key_iv text not null,
  key_hint text not null,
  created_at integer not null
);
create index api_key_user_idx on api_key (user_id);

insert into api_key (id, user_id, provider, base_url, key_ciphertext, key_iv, key_hint, created_at)
select id, user_id, provider, base_url, key_ciphertext, key_iv, key_hint, created_at from model_config;

alter table model_config add column key_id text references api_key (id) on delete cascade;
update model_config set key_id = id;
alter table model_config drop column provider;
alter table model_config drop column base_url;
alter table model_config drop column key_ciphertext;
alter table model_config drop column key_iv;
alter table model_config drop column key_hint;
create index model_config_key_idx on model_config (key_id);

-- Per-user preferences; the default model is used by projects that don't pin one
create table user_pref (
  user_id text primary key references "user" (id) on delete cascade,
  default_model_id text references model_config (id) on delete set null
);

-- Each user's earliest model becomes their default
insert into user_pref (user_id, default_model_id)
select user_id, id from model_config m
where created_at = (select min(created_at) from model_config where user_id = m.user_id)
group by user_id;
