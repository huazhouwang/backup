/** Models: a user's API keys and model configurations; under /projects/:id the model a project uses and its token usage */
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { encryptSecret, keyHint } from '../crypto';
import { m } from '@/lib/i18n';
import { PROVIDERS, localizedProviders } from '../providers';
import * as repo from '../repo';
import { body, minRole, requireUser, type AppEnv, type ProjectEnv } from '../http';

export const routes = new Hono<AppEnv>();
/** Mounted under /projects/:id */
export const projectRoutes = new Hono<ProjectEnv>();

routes.get('/models', async c => {
  const u = requireUser(c);
  const [keys, models] = await Promise.all([repo.listApiKeys(u.id), repo.listModels(u.id)]);
  return c.json({ keys, models, defaultModelId: await repo.defaultModelId(u.id, models), providers: localizedProviders() });
});

const modelName = z.string().trim().min(1).max(100);

routes.post('/keys', async c => {
  const u = requireUser(c);
  const b = await body(
    c,
    z.object({
      provider: z.enum(Object.keys(PROVIDERS) as [string, ...string[]]),
      apiKey: z.string().trim().min(8).max(400),
      baseUrl: z.url().max(300).nullish(),
      // The first model to use with the key, so a new key is usable in one step
      model: modelName.optional(),
    }),
  );
  if (PROVIDERS[b.provider].needsBaseUrl && !b.baseUrl) throw new HTTPException(400, { message: m.server_err_base_url_required() });
  const id = repo.newId('k');
  const { ciphertext, iv } = await encryptSecret(b.apiKey, id);
  await repo.insertApiKey({
    id,
    user_id: u.id,
    provider: b.provider,
    base_url: b.baseUrl ?? null,
    key_ciphertext: ciphertext,
    key_iv: iv,
    key_hint: keyHint(b.apiKey),
    created_at: Date.now(),
  });
  const modelId = b.model ? repo.newId('l') : null;
  if (modelId) await repo.insertModel({ id: modelId, user_id: u.id, key_id: id, label: b.model!, model: b.model! });
  return c.json({ id, modelId });
});

routes.delete('/keys/:id', async c => {
  await repo.deleteApiKey(requireUser(c).id, c.req.param('id'));
  return c.json({ ok: true });
});

routes.post('/models', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ keyId: z.string(), model: modelName, label: z.string().trim().min(1).max(40).optional() }));
  const key = await repo.getApiKey(b.keyId);
  if (!key || key.user_id !== u.id) throw new HTTPException(400, { message: m.server_err_key_not_owned() });
  const id = repo.newId('l');
  await repo.insertModel({ id, user_id: u.id, key_id: key.id, label: b.label ?? b.model, model: b.model });
  return c.json({ id });
});

routes.put('/models/default', async c => {
  const u = requireUser(c);
  const b = await body(c, z.object({ modelId: z.string() }));
  const model = await repo.getModel(b.modelId);
  if (!model || model.user_id !== u.id) throw new HTTPException(400, { message: m.server_err_model_config_not_owned() });
  await repo.setDefaultModel(u.id, model.id);
  return c.json({ ok: true });
});

routes.delete('/models/:id', async c => {
  await repo.deleteModel(requireUser(c).id, c.req.param('id'));
  return c.json({ ok: true });
});

/** Pin a model for the project (shared members use it too); null goes back to the owner's default */

projectRoutes.put('/model', minRole('owner'), async c => {
  const id = c.var.projectId;
  const user = c.var.user!;
  const b = await body(c, z.object({ modelConfigId: z.string().nullable() }));
  if (b.modelConfigId) {
    const model = await repo.getModel(b.modelConfigId);
    if (!model || model.user_id !== user.id) throw new HTTPException(400, { message: m.server_err_model_config_not_owned() });
  }
  await repo.setProjectModel(id, b.modelConfigId);
  return c.json({ ok: true });
});

projectRoutes.get('/usage', minRole('owner'), async c => {
  const id = c.var.projectId;
  return c.json(await repo.projectUsage(id));
});
