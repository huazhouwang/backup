// E2E (issue 185): with the platform's model configured (.dev.vars: PLATFORM_MODEL_* pointing at the fake model), a guest
// designs without a key of their own; each chat costs free credits, the chat shows the balance, and running out shows how to
// get more and refuses further chats. Skipped when the dev server has no platform model.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { BASE, OUT, check } from './support.mjs';

test('free credits on the platform model', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const api = path => page.evaluate(async p => (await fetch(`/api${p}`)).json(), path);
  const before = await api('/me/credits');
  test.skip(!before.available, 'the dev server has no platform model (PLATFORM_MODEL_* in .dev.vars)');
  check(before.guest && before.balance === before.allowance, `a guest starts with the full allowance (${before.balance})`);

  // No key of their own: the chat uses OpenSU's model and shows the balance
  check(await page.getByText(/模型：OpenSU/).isVisible(), 'the chat uses the platform model');
  check(await page.getByText(/剩余额度/).isVisible(), 'the balance shows in the chat');
  const box = page.getByPlaceholder('说说想怎么改…');
  await box.fill('这个方案一共多大？');
  await box.press('Enter');
  // Whatever the model answers: wait until its turn is over (the send button is back)
  await page.waitForFunction(() => !document.querySelector('[aria-label="停止"]'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const after = await api('/me/credits');
  check(after.balance < before.balance, `the chat cost credits (${before.balance} → ${after.balance})`);
  await page.screenshot({ path: `${OUT}/credits-1-balance.png` });

  // Spend the rest (in the local database), then the chat says how to get more and refuses to send
  const me = await page.evaluate(async () => (await (await fetch('/api/me')).json()).user.id);
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'plinth',
      '--local',
      '--command',
      `insert into usage (user_id, platform, credits, created_at) values ('${me}', 1, ${after.balance}, ${Date.now()})`,
    ],
    { stdio: 'ignore' },
  );
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  await page.getByText('免费额度用完了').waitFor({ timeout: 10000 });
  check(true, 'running out shows how to get more');
  check(await page.getByRole('button', { name: '登录' }).first().isVisible(), 'a guest is offered signing in');
  check(await box.isDisabled(), 'the chat box is disabled');
  const refused = await page.evaluate(
    async id =>
      (
        await fetch(`/api/projects/${id}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // A minimal AG-UI run, as the chat sends
          body: JSON.stringify({
            threadId: 't',
            runId: 'r',
            messages: [{ id: 'm1', role: 'user', content: 'hi' }],
            tools: [],
            context: [],
            state: {},
            forwardedProps: {},
          }),
        })
      ).status,
    page.url().match(/\/p\/([^/?]+)/)[1],
  );
  check(refused === 402, `the server refuses a chat without credits (${refused})`);
  await page.screenshot({ path: `${OUT}/credits-2-out.png` });

  // Their own key: the chat goes on, on their model, without spending credits
  await page.evaluate(() =>
    fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'compatible', model: 'own-model', apiKey: 'sk-own-0000', baseUrl: 'http://127.0.0.1:8787/v1' }),
    }),
  );
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  check(await box.isEnabled(), 'with their own key the chat box is back');
  const spent = (await api('/me/credits')).spent;
  await box.fill('这个方案一共多大？');
  await box.press('Enter');
  await page.waitForTimeout(1000);
  await page.waitForFunction(() => !document.querySelector('[aria-label="停止"]'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  check((await api('/me/credits')).spent === spent, 'their own model spends no credits');
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
