/** Chat history, one thread per project and user */
import { db, now } from './db';

export const getChat = (projectId: string, userId: string) =>
  db().prepare('select messages from chat_thread where project_id = ? and user_id = ?').bind(projectId, userId).first<{ messages: string }>();

export const putChat = (projectId: string, userId: string, messages: string) =>
  db()
    .prepare(
      'insert into chat_thread (project_id, user_id, messages, updated_at) values (?, ?, ?, ?) on conflict (project_id, user_id) do update set messages = excluded.messages, updated_at = excluded.updated_at',
    )
    .bind(projectId, userId, messages, now())
    .run();
