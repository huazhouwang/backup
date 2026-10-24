/** The agent under /projects/:id: chatting with it and each user's chat thread */
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { handleChat } from '../chat';
import { decryptSecret } from '../crypto';
import { m } from '@/lib/i18n';
import * as repo from '../repo';
import { limit, minRole, parseJson, type ProjectEnv } from '../http';

/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

projectRoutes.post('/chat', minRole('editor'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  await limit(env.RL_CHAT, user.id);
  const p = await repo.getProject(id);
  if (!p) throw new HTTPException(404, { message: m.server_err_project_not_found() });
  return handleChat(c.req.raw, async requested => {
    // The model picked in the chat, else the project's pinned model, else the owner's default; always one of the owner's
    const models = await repo.listModels(p.owner_id);
    const has = (x: string | null | undefined) => (x && models.some(o => o.id === x) ? x : null);
    const modelId = has(requested) ?? has(p.model_config_id) ?? (await repo.defaultModelId(p.owner_id, models));
    const config = modelId ? await repo.getModel(modelId) : null;
    if (!config) throw new HTTPException(400, { message: m.server_err_no_model() });
    return {
      config,
      apiKey: await decryptSecret(config.key_ciphertext, config.key_iv, config.key_id),
      onUsage: (input, output) => repo.recordUsage({ userId: user.id, projectId: id, modelConfigId: config.id, input, output }),
    };
  });
});

projectRoutes.get('/chat-thread', minRole('viewer'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const t = await repo.getChat(id, user.id);
  let messages: unknown = [];
  try {
    if (t) messages = JSON.parse(t.messages);
  } catch {
    // A corrupt stored thread starts over instead of failing the editor
  }
  return c.json(Array.isArray(messages) ? messages : []);
});

projectRoutes.put('/chat-thread', minRole('editor'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const raw = await c.req.text();
  if (raw.length > 800_000) throw new HTTPException(413, { message: m.server_err_chat_too_long() });
  if (!Array.isArray(parseJson(raw))) throw new HTTPException(400, { message: m.server_err_invalid_chat() });
  await repo.putChat(id, user.id, raw);
  return c.json({ ok: true });
});
