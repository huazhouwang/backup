// E2E with a real model (issues 184, 203): "add rain over the courtyard" → the agent installs the rain effect over it and it
// falls in 3D; "heavier, with some wind" → the agent tunes its parameters instead of rewriting it. Live with E2E_MODEL=bridge
// (a subagent answers), replayed from the cassette otherwise.
import { test } from '@playwright/test';
import { join } from 'node:path';
import { serve } from './model-bridge.mjs';
import { BASE, OUT, check } from './support.mjs';

const PORT = 8790;
const LIVE = process.env.E2E_MODEL === 'bridge';
const CASSETTE = join(import.meta.dirname, 'cassettes', 'agent-effects.json');

test('rain over the courtyard, by asking', async ({ browser: b }) => {
  test.setTimeout(LIVE ? 30 * 60_000 : 5 * 60_000);
  const bridge = await serve(PORT, { mode: LIVE ? 'live' : 'replay', cassette: CASSETTE, timeout: LIVE ? 900 : 5 });
  try {
    const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let started = 0;
    let finished = 0;
    page.on('request', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && started++);
    page.on('requestfinished', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    page.on('requestfailed', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    const settled = async () => {
      for (let quiet = 0; quiet < 6; await page.waitForTimeout(500)) quiet = started > 0 && started === finished ? quiet + 1 : 0;
    };

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
    await page.evaluate(
      port =>
        fetch('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'compatible', model: 'bridge', apiKey: 'sk-bridge-0000', baseUrl: `http://127.0.0.1:${port}/v1` }),
        }),
      PORT,
    );
    await page.goto(page.url().split('?')[0] + '?mode=3d');
    await page.waitForFunction(() => window.artifact?.ready);

    const t0 = Date.now();
    const box = page.getByPlaceholder('说说想怎么改…');
    await box.fill('在庭院里加上下雨的效果');
    await box.press('Enter');
    await settled();
    const widgets = () => page.evaluate(() => window.artifact.project().widgets);
    const [rain] = (await widgets()).filter(w => w.widget.id === 'rain');
    check(!!rain && /庭院/.test(rain.params.space ?? ''), `rain over the courtyard (${JSON.stringify(rain?.params)})`);
    if (LIVE) check(Date.now() - t0 < 60_000 * 10, 'within the turn');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/agent-effects-1-rain.png` });

    await box.fill('雨再大一点，带点风');
    await box.press('Enter');
    await settled();
    const after = (await widgets()).filter(w => w.widget.id === 'rain');
    check(after.length === 1, 'still one rain: tuned, not added again');
    check(
      (after[0].params.intensity ?? 0.6) > (rain.params.intensity ?? 0.6) && Math.abs(after[0].params.wind ?? 1) > Math.abs(rain.params.wind ?? 1),
      `heavier, with wind (${JSON.stringify(after[0].params)})`,
    );
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/agent-effects-2-heavier.png` });
    check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    bridge.close();
  }
});
