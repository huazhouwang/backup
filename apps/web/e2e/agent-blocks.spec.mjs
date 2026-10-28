// E2E with a real model (issue 204): building blocks made by talking, saved, and reused in another design. In one design the agent
// makes a tool (labels of each room's area), an effect (autumn leaves over the courtyard) and an object (a round stone table) and
// saves them: the tool and the effect into the user's widget library (the effect also "for me", so it shows in every design), the
// table into their look library. A second design then shows the leaves at once and installs the tool and the table from the
// libraries. Live with E2E_MODEL=bridge (a subagent answers), replayed from the cassette otherwise.
import { test } from '@playwright/test';
import { join } from 'node:path';
import { serve } from './model-bridge.mjs';
import { BASE, OUT, check } from './support.mjs';

const PORT = 8791;
const LIVE = process.env.E2E_MODEL === 'bridge';
const CASSETTE = join(import.meta.dirname, 'cassettes', 'agent-blocks.json');

test('blocks made by talking, saved and reused', async ({ browser: b }) => {
  test.setTimeout(LIVE ? 60 * 60_000 : 6 * 60_000);
  const bridge = await serve(PORT, { mode: LIVE ? 'live' : 'replay', cassette: CASSETTE, timeout: LIVE ? 1200 : 5 });
  try {
    const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let started = 0;
    let finished = 0;
    page.on('request', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && started++);
    page.on('requestfinished', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    page.on('requestfailed', r => /\/projects\/[^/]+\/chat$/.test(r.url()) && finished++);
    // The agent is done when no model turn is in flight and the chat is no longer running (a tool may run for a while between turns)
    const settled = async () => {
      for (let quiet = 0; quiet < 6; await page.waitForTimeout(500)) {
        const running = await page.locator('[aria-label="停止"]').count();
        quiet = started > 0 && started === finished && !running ? quiet + 1 : 0;
      }
    };
    const api = (path, init) =>
      page.evaluate(
        async ([p, i]) => {
          const r = await fetch(`/api${p}`, i);
          return r.json();
        },
        [path, init],
      );
    const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
    await api('/keys', json({ provider: 'compatible', model: 'bridge', apiKey: 'sk-bridge-0000', baseUrl: `http://127.0.0.1:${PORT}/v1` }));
    // The user keeps a look library of their own (made on the libraries page)
    const looks = await api('/libraries', json({ name: '我的家具' }));
    await page.reload();
    await page.waitForFunction(() => window.artifact?.ready);

    // The user's own model (the bridge) is picked once the chat has loaded their keys
    await page.getByText('模型：bridge').waitFor({ timeout: 30_000 });
    const box = page.getByPlaceholder('说说想怎么改…');
    const say = async text => {
      await box.fill(text);
      await box.press('Enter');
      await settled();
    };
    const project = () => page.evaluate(() => window.artifact.project());

    await say('做一个工具：在每个房间中间标出它的面积');
    let p = await project();
    const tool = Object.entries(p.library.widgets ?? {}).find(([, w]) => /label/.test(w.script));
    check(!!tool, `a tool written as the design's own widget (${tool?.[0]})`);

    await say('再做一个秋天落叶的效果，落在庭院里');
    p = await project();
    const leaves = Object.entries(p.library.widgets ?? {}).find(([, w]) => /particles/.test(w.script));
    check(!!leaves, `an effect written as the design's own widget (${leaves?.[0]})`);
    await page.screenshot({ path: `${OUT}/agent-blocks-1-made.png` });

    await say('再做一个圆形石桌，放在庭院里');
    p = await project();
    const tables = Object.entries(p.library.looks ?? {});
    check(tables.length > 0, `an object made as a look of the design (${tables.map(([id]) => id).join(', ')})`);

    await say('把这三个都保存起来，以后别的方案也要用；落叶效果我每个方案都要');
    const widgetLibs = await api('/widget-libraries/files');
    const mine = widgetLibs.filter(f => f.role === 'owner').flatMap(f => Object.keys(f.library.widgets).map(w => ({ library: f.library.id, widget: w })));
    check(mine.length >= 2, `the tool and the effect are in the user's widget library (${mine.map(w => w.widget).join(', ')})`);
    const forMe = await api('/me/widgets');
    check(forMe.widgets.length >= 1, `the leaves show in every design ("for me": ${forMe.widgets.map(w => w.name).join(', ')})`);
    const lookLib = await api(`/libraries/${looks.id}`);
    check(Object.keys(lookLib.library?.looks ?? lookLib.looks ?? {}).length >= 1, "the table is in the user's look library");

    // A second design: the leaves are there already; the tool and the table come from the libraries
    const second = await api('/projects', json({ name: '另一套', template: 'sample' }));
    await page.goto(`${BASE}/p/${second.id}?mode=3d`);
    await page.waitForFunction(() => window.artifact?.ready);
    check((await api('/me/widgets')).widgets.length >= 1, 'the effect is on in the second design');
    const toolRef = mine.find(w => !forMe.widgets.some(f => f.widget.id === w.widget)) ?? mine[0];
    const installed = await page.evaluate(
      ([library, widget]) => window.artifact.call('widget_install', { library, widget }),
      [toolRef.library, toolRef.widget],
    );
    check(installed.ok, `the tool installs in the second design (${installed.ok ? installed.result.name : installed.error?.message})`);
    const look = Object.keys(lookLib.library?.looks ?? lookLib.looks ?? {})[0];
    const got = await page.evaluate(([library, look]) => window.artifact.call('library_look_get', { library, look }), [looks.id, look]);
    const imported = got.ok && (await page.evaluate(src => window.artifact.call('look_import', src), got.result));
    check(!!imported?.ok, `the table imports into the second design (${imported?.ok ? 'ok' : (imported?.error?.message ?? got.error?.message)})`);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/agent-blocks-2-reused.png` });
    check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    bridge.close();
  }
});
