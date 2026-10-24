// E2E: guest trial → configure a model (fake LLM) → edit the plan via chat → confirm prompt for gated actions → usage recorded
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('agent', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  const projectId = page.url().match(/\/p\/([^/?]+)/)[1];
  await page.waitForFunction(() => window.artifact?.ready);

  const api = (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, { ...i, headers: { 'Content-Type': 'application/json' } });
        return { status: r.status, body: await r.json() };
      },
      [path, init],
    );

  // A key is saved once with its first model; the project uses the owner's default without being set up (#44)
  const added = await api('/keys', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'compatible',
      model: 'fake-model',
      apiKey: 'sk-test-12345678',
      baseUrl: process.env.FAKE_LLM ?? 'http://127.0.0.1:8787/v1',
    }),
  });
  check(added.status === 200 && added.body.modelId, `save key with its first model ${added.status}`);
  const second = await api('/models', { method: 'POST', body: JSON.stringify({ keyId: added.body.id, model: 'fake-model-2' }) });
  check(second.status === 200, 'a second model reuses the saved key');
  const models = await api('/models');
  check(!JSON.stringify(models.body).includes('sk-test-12345678'), 'model list does not return the plaintext key');
  check(models.body.keys.length === 1 && models.body.keys[0].key_hint === '…5678', 'only the last 4 key characters are shown');
  check(models.body.models.length === 2 && models.body.defaultModelId === added.body.modelId, 'the first model becomes the default');
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  check((await page.getByText('先配置大模型').count()) === 0, 'no setup prompt when a model is configured');
  // Levels are picked on the canvas, apart from the plan / 3D switch in the toolbar (#46)
  const levelPicker = page.getByRole('main').getByRole('group', { name: '楼层' });
  check((await page.getByRole('banner').getByRole('group', { name: '楼层' }).count()) === 0, 'level picker is not in the toolbar');
  await levelPicker.getByRole('button', { name: '二层' }).click();
  await page.waitForURL(/level=/);
  check(
    (await page.evaluate(() => window.artifact.project().levels.find(l => l.name === '二层')?.id)) === new URL(page.url()).searchParams.get('level'),
    'level picked on the canvas',
  );
  await levelPicker.getByRole('button', { name: '一层' }).click();
  // Switch the chat to the second model; the next message uses it
  await page.getByRole('combobox', { name: '对话使用的模型' }).click();
  await page.getByRole('option', { name: /fake-model-2/ }).click();
  check(await page.getByText('模型：fake-model-2').isVisible(), 'chat switched to the second model');
  const chatModels = [];
  page.on(
    'request',
    r =>
      r.url().endsWith(`/projects/${projectId}/chat`) &&
      chatModels.push(JSON.parse(r.postData() ?? '{}').forwardedProps?.modelId ?? JSON.parse(r.postData() ?? '{}').modelId),
  );

  const before = await page.evaluate(() => window.artifact.call('get_object', { ref: '一层·老人房一' }));
  const box = page.getByPlaceholder('说说想怎么改…');
  await box.fill('老人房一扩到 12.5 平');
  await box.press('Enter');
  await page
    .getByText(/^好了。/)
    .first()
    .waitFor({ timeout: 30000 });
  const after = await page.evaluate(() => window.artifact.call('get_object', { ref: '一层·老人房一' }));
  check(chatModels[0] === second.body.id, `chat request uses the picked model: ${chatModels[0]}`);
  check(Math.abs(after.result.netArea - 12.5) < 0.15, `agent resized room: ${before.result.netArea} → ${after.result.netArea} m²`);
  check(await page.getByText('对比改前').isVisible(), 'change card shown (before/after compare, undo)');
  await page.screenshot({ path: `${OUT}/agent-1.png` });

  // Action that needs confirmation: removing a level
  await box.fill('删掉三层');
  await box.press('Enter');
  await page
    .getByText('agent 想要：删楼层')
    .waitFor({ timeout: 30000 })
    .catch(async e => {
      await page.screenshot({ path: `${OUT}/agent-fail.png` });
      console.log(
        await page
          .locator('main + aside, aside')
          .first()
          .innerText()
          .catch(() => ''),
      );
      throw e;
    });
  check(true, 'removing a level asks for confirmation');
  await page.screenshot({ path: `${OUT}/agent-2-approval.png` });
  await page.getByRole('button', { name: '不要' }).click();
  await page.waitForTimeout(2500);
  const levels = await page.evaluate(() => window.artifact.project().levels.map(l => l.name));
  check(levels.includes('三层'), `level kept after declining: ${levels.join(', ')}`);

  await page.waitForTimeout(2000);
  const usage = await api(`/projects/${projectId}/usage`);
  check(usage.body[0]?.input > 0, `usage recorded: ${JSON.stringify(usage.body[0])}`);
  const thread = await api(`/projects/${projectId}/chat-thread`);
  check(Array.isArray(thread.body) && thread.body.length >= 2, `chat saved (${thread.body.length} messages)`);
  const versions = await api(`/projects/${projectId}/versions`);
  check(versions.body.length >= 2, `new version auto-saved: ${versions.body[0]?.summary}`);

  // Starting from scratch: blank project, one-sentence brief
  const blank = await api('/projects', { method: 'POST', body: JSON.stringify({ name: '新房子', template: 'blank' }) });
  await page.goto(`${BASE}/p/${blank.body.id}`);
  await page.waitForFunction(() => window.artifact?.ready);
  await page.getByPlaceholder('说说想怎么改…').fill('一家四口，一层，要两间卧室');
  await page.getByPlaceholder('说说想怎么改…').press('Enter');
  await page
    .getByText(/^好了。/)
    .first()
    .waitFor({ timeout: 30000 });
  const built = await page.evaluate(() => window.artifact.project());
  check(built.spaces.length === 5 && built.walls.length >= 10, `built from scratch: ${built.spaces.length} rooms, ${built.walls.length} walls`);
  check(built.brief.household?.length === 2, 'brief recorded');
  const issues = await page.evaluate(() => window.artifact.call('check_rules', {}));
  check(issues.result.issues.filter(i => i.severity === 'error').length === 0, `rule check has no errors (${issues.result.issues.length} warnings)`);
  await page.screenshot({ path: `${OUT}/agent-3-scratch.png` });

  check(errors.filter(e => !/GPU stall|THREE\./.test(e)).length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
