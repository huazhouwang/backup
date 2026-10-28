// E2E with a real model (issue 184): the agent's requests go to the test model bridge. With E2E_MODEL=bridge a Claude subagent
// answers them live (node e2e/model-bridge.mjs next / reply) and the exchange is recorded; otherwise the recording is replayed.
import { test } from '@playwright/test';
import { join } from 'node:path';
import { serve } from './model-bridge.mjs';
import { BASE, OUT, check } from './support.mjs';

const PORT = 8788;
const LIVE = process.env.E2E_MODEL === 'bridge';
const CASSETTE = join(import.meta.dirname, 'cassettes', 'agent-bridge.json');

test('agent with a real model through the bridge', async ({ browser: b }) => {
  test.setTimeout(LIVE ? 30 * 60_000 : 5 * 60_000);
  const bridge = await serve(PORT, { mode: LIVE ? 'live' : 'replay', cassette: CASSETTE, timeout: LIVE ? 900 : 5 });
  try {
    const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Model turns in flight: each one is a request to the project's chat endpoint
    let started = 0;
    let finished = 0;
    page.on('request', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && started++);
    page.on('requestfinished', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    page.on('requestfailed', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    /** The agent is done when no model turn has been in flight for a few seconds */
    const settled = async () => {
      for (let quiet = 0; quiet < 6; await page.waitForTimeout(500)) quiet = started > 0 && started === finished ? quiet + 1 : 0;
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
    const added = await page.evaluate(async port => {
      const r = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'compatible', model: 'bridge', apiKey: 'sk-bridge-0000', baseUrl: `http://127.0.0.1:${port}/v1` }),
      });
      return r.status;
    }, PORT);
    check(added === 200, 'the bridge is configured as the model');
    await page.reload();
    await page.waitForFunction(() => window.artifact?.ready);

    const area = () => page.evaluate(async () => (await window.artifact.call('get_object', { ref: '一层·老人房一' })).result.netArea);
    const before = await area();
    const box = page.getByPlaceholder('说说想怎么改…');
    await box.fill('老人房一扩到 12.5 平');
    await box.press('Enter');
    await settled();
    const after = await area();
    check(Math.abs(after - 12.5) <= 0.3, `the agent resized the room: ${before} → ${after} m²`);
    const rules = await page.evaluate(() => window.artifact.call('check_rules', {}));
    check(rules.result.issues.filter(i => i.severity === 'error').length === 0, 'the change keeps the design free of rule errors');
    check(started >= 2, `the agent used tools and then answered (${started} model turns)`);
    await page.screenshot({ path: `${OUT}/agent-bridge-1.png` });
    check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    bridge.close();
  }
});
