/** API keys, model configurations and token usage */
import { m } from '@/lib/i18n';
import { db, now } from './db';

/** A saved provider key; the plaintext key is only ever decrypted on the server */
export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: string;
  base_url: string | null;
  key_ciphertext: string;
  key_iv: string;
  key_hint: string;
  created_at: number;
}

/** A model picked for a key, as the UI lists it */
export interface ModelRow {
  id: string;
  key_id: string;
  label: string;
  model: string;
  provider: string;
  created_at: number;
}

/** A model with everything needed to call it */
export type ModelWithKey = ModelRow & Pick<ApiKeyRow, 'user_id' | 'base_url' | 'key_ciphertext' | 'key_iv'>;

export async function listApiKeys(userId: string) {
  const { results } = await db()
    .prepare('select id, provider, base_url, key_hint, created_at from api_key where user_id = ? order by created_at')
    .bind(userId)
    .all<Omit<ApiKeyRow, 'key_ciphertext' | 'key_iv' | 'user_id'>>();
  return results;
}

export async function insertApiKey(row: ApiKeyRow) {
  await db()
    .prepare('insert into api_key (id, user_id, provider, base_url, key_ciphertext, key_iv, key_hint, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.user_id, row.provider, row.base_url, row.key_ciphertext, row.key_iv, row.key_hint, row.created_at)
    .run();
}

export const getApiKey = (id: string) => db().prepare('select * from api_key where id = ?').bind(id).first<ApiKeyRow>();
export const deleteApiKey = (userId: string, id: string) => db().prepare('delete from api_key where user_id = ? and id = ?').bind(userId, id).run();

/** The user's models, oldest first */
export async function listModels(userId: string) {
  const { results } = await db()
    .prepare(
      'select m.id, m.key_id, m.label, m.model, k.provider, m.created_at from model_config m join api_key k on k.id = m.key_id where m.user_id = ? order by m.created_at, m.id',
    )
    .bind(userId)
    .all<ModelRow>();
  return results;
}

export async function insertModel(row: { id: string; user_id: string; key_id: string; label: string; model: string }) {
  const t = now();
  await db().batch([
    db()
      .prepare('insert into model_config (id, user_id, key_id, label, model, created_at) values (?, ?, ?, ?, ?, ?)')
      .bind(row.id, row.user_id, row.key_id, row.label, row.model, t),
    // The first model becomes the default
    db()
      .prepare(
        'insert into user_pref (user_id, default_model_id) values (?, ?) on conflict (user_id) do update set default_model_id = coalesce(default_model_id, excluded.default_model_id)',
      )
      .bind(row.user_id, row.id),
  ]);
}

export const getModel = (id: string) =>
  db()
    .prepare(
      'select m.id, m.key_id, m.label, m.model, m.created_at, m.user_id, k.provider, k.base_url, k.key_ciphertext, k.key_iv from model_config m join api_key k on k.id = m.key_id where m.id = ?',
    )
    .bind(id)
    .first<ModelWithKey>();
export const deleteModel = (userId: string, id: string) => db().prepare('delete from model_config where user_id = ? and id = ?').bind(userId, id).run();

/** The user's default model: the one they chose, else their earliest (when the chosen one was deleted) */
export async function defaultModelId(userId: string, models?: ModelRow[]) {
  const list = models ?? (await listModels(userId));
  const pref = await db().prepare('select default_model_id from user_pref where user_id = ?').bind(userId).first<{ default_model_id: string | null }>();
  return list.find(x => x.id === pref?.default_model_id)?.id ?? list[0]?.id ?? null;
}

export const setDefaultModel = (userId: string, modelId: string) =>
  db()
    .prepare('insert into user_pref (user_id, default_model_id) values (?, ?) on conflict (user_id) do update set default_model_id = excluded.default_model_id')
    .bind(userId, modelId)
    .run();

export const recordUsage = (u: { userId: string; projectId: string; modelConfigId: string; input: number; output: number }) =>
  db()
    .prepare('insert into usage (user_id, project_id, model_config_id, input_tokens, output_tokens, created_at) values (?, ?, ?, ?, ?, ?)')
    .bind(u.userId, u.projectId, u.modelConfigId, u.input, u.output, now())
    .run();

export async function projectUsage(projectId: string) {
  const { results } = await db()
    .prepare(
      `select u.user_id, coalesce(x.name, ?) as name, sum(u.input_tokens) as input, sum(u.output_tokens) as output, count(*) as calls
       from usage u left join "user" x on x.id = u.user_id where u.project_id = ? group by u.user_id order by input desc`,
    )
    .bind(m.server_deleted_user(), projectId)
    .all<{ user_id: string; name: string; input: number; output: number; calls: number }>();
  return results;
}
