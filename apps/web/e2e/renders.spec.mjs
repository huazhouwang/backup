// E2E (issue 195): style renders with the placeholder provider (no image model configured). The styles panel renders the design
// in a preset from automatic shots; the images are kept, listed by style, open over the 3D view they came from, cost free
// credits and are private to the design's members. The agent's render_style makes the same; out of credits, rendering stops.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { BASE, OUT, check } from './support.mjs';

const sql = command =>
  JSON.parse(
    execFileSync('node', ['../../node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'plinth', '--local', '--json', '--command', command], {
      encoding: 'utf8',
    }),
  )[0].results;

test('style renders', async ({ browser: b }) => {
  test.setTimeout(5 * 60_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const id = page.url().match(/\/p\/([^/?]+)/)[1];
  const api = (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, i);
        return { status: r.status, type: r.headers.get('content-type'), body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
      },
      [path, init],
    );
  const config = (await api('/render-config')).body;
  check(config.placeholder && config.credits > 0, `the placeholder provider makes images (${config.credits} credit each)`);
  const before = (await api('/me/credits')).body.balance;

  // The styles panel: pick 日式, render
  await page.getByRole('tab', { name: '风格' }).click();
  await page.getByText('现在出的是效果示意').waitFor();
  check(true, 'the panel says the images are illustrations for now');
  await page
    .getByRole('button', { name: /日式/ })
    .first()
    .click();
  const start = page.getByRole('button', { name: /出 \d 张日式效果图/ });
  const count = Number((await start.innerText()).match(/出 (\d) 张/)[1]);
  check(count === 4, `four shots: the aerial, the street and two rooms (${count})`);
  await start.click();
  await page.getByText(/正在出图/).waitFor();
  check(true, 'progress shows while rendering');
  await start.waitFor({ timeout: 180_000 });
  const gallery = page.locator('[aria-label="效果图"]');
  await page.waitForFunction(
    () => [...document.querySelectorAll('[aria-label="效果图"] img')].filter(i => i.complete && i.naturalWidth > 0).length >= 4,
    null,
    { timeout: 30_000 },
  );
  check(true, 'the four images show in the gallery');
  check(await gallery.getByText('日式', { exact: true }).isVisible(), 'grouped under their style');
  await page.screenshot({ path: `${OUT}/renders-1-panel.png` });

  const list = (await api(`/projects/${id}/renders`)).body;
  check(list.length === 4 && list.every(r => r.style === 'japanese' && r.provider === 'placeholder'), `kept with the design (${list.length})`);
  check(new Set(list.map(r => r.shot)).size === 4, 'one per shot');
  const after = (await api('/me/credits')).body.balance;
  check(before - after === 4 * config.credits, `each image cost credits (${before} → ${after})`);
  const img = await api(`/renders/${list[0].id}/image`);
  const src = await api(`/renders/${list[0].id}/source`);
  check(
    img.status === 200 && img.type === 'image/svg+xml' && src.status === 200 && src.type === 'image/jpeg',
    'the image and the 3D view it came from are served',
  );

  // Opened large, over the model, to compare
  await gallery.locator('img').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('模型', { exact: true }).waitFor();
  check(await dialog.getByRole('slider').isVisible(), 'the image opens over the 3D view, with a slider to compare');
  await page.screenshot({ path: `${OUT}/renders-2-compare.png` });
  await page.keyboard.press('Escape');

  // A stranger can't see a private design's images
  const other = await b.newPage();
  await other.goto(BASE, { waitUntil: 'networkidle' });
  const stranger = await other.evaluate(async p => (await fetch(p)).status, `/api/renders/${list[0].id}/image`);
  check(stranger === 404, `private to the design's members (${stranger})`);
  await other.close();

  // The agent's render_style makes the same, in a preset
  const r = await page.evaluate(() => window.artifact.call('render_style', { style: 'french', shots: 2 }));
  check(r.ok && r.result.images.length === 2, `render_style made images (${r.ok ? r.result.images.length : r.error?.message})`);
  check((await api(`/projects/${id}/renders`)).body.length === 6, 'and they are kept too');

  // Out of credits: the server refuses before calling the provider
  const me = (await api('/me')).body.user.id;
  const left = (await api('/me/credits')).body.balance;
  sql(`insert into usage (user_id, platform, credits, created_at) values ('${me}', 1, ${left}, ${Date.now()})`);
  const refused = await api(`/projects/${id}/renders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      style: 'french',
      styleName: '法式',
      palette: ['#ffffff', '#000000'],
      shot: 'aerial',
      shotName: '鸟瞰',
      prompt: 'x',
      negative: '',
      width: 1024,
      height: 768,
      passes: { color: 'data:image/jpeg;base64,AAAA' },
    }),
  });
  check(refused.status === 402, `no credits, no image (${refused.status})`);
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
