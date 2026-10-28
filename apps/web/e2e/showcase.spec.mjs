// E2E (issue 196): the share page. The owner publishes a design with its style renders; a visitor (signed out) opens the link:
// the hero render over the model (before/after), the styles made, the house in 3D and its plan, storeys and area, images to
// download in three sizes, and a link preview (Open Graph) in the page's HTML. Remixing copies the house into the visitor's
// own design. The owner can take an image off the page and stop sharing, which turns the link off.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { BASE, OUT, check } from './support.mjs';

const sql = command =>
  JSON.parse(
    execFileSync('node', ['../../node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'plinth', '--local', '--json', '--command', command], {
      encoding: 'utf8',
    }),
  )[0].results;

test('share page', async ({ browser: b }) => {
  test.setTimeout(5 * 60_000);
  const owner = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  owner.on('pageerror', e => errors.push(e.message));
  await owner.goto(BASE, { waitUntil: 'networkidle' });
  await owner.getByRole('button', { name: /打开样例方案/ }).click();
  await owner.waitForURL(/\/p\//);
  await owner.waitForFunction(() => window.artifact?.ready);
  const id = owner.url().match(/\/p\/([^/?]+)/)[1];
  const made = await owner.evaluate(() => window.artifact.call('render_style', { style: 'french', shots: 3 }));
  check(made.ok, 'the owner has three French renders');

  // Publish from the styles panel
  await owner.getByRole('tab', { name: '风格' }).click();
  await owner.getByRole('button', { name: '发布', exact: true }).click();
  const link = owner.getByRole('textbox', { name: '分享页链接' });
  await link.waitFor();
  const url = await link.inputValue();
  const token = url.split('/h/')[1];
  check(/\/h\/[0-9a-f]{16}$/.test(url), `published at ${url}`);
  await owner.screenshot({ path: `${OUT}/showcase-1-publish.png` });

  // The page's HTML carries the link preview
  const html = await (await fetch(`${BASE}/h/${token}`)).text();
  check(/<meta property="og:image" content="[^"]*\/api\/showcase\/[0-9a-f]+\/preview">/.test(html), 'Open Graph image in the HTML');
  check(
    /<meta property="og:title" content="[^"]+ · OpenSU">/.test(html) && /og:description" content="\d 层 · 建筑面积 \d+ ㎡/.test(html),
    'title and size in the preview',
  );
  const preview = await fetch(`${BASE}/api/showcase/${token}/preview`);
  check(
    preview.ok && /image\/(jpeg|png)/.test(preview.headers.get('content-type')),
    `the preview image is a photo format (${preview.headers.get('content-type')})`,
  );

  // A visitor, signed out, on a phone
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const visitor = await ctx.newPage();
  visitor.on('pageerror', e => errors.push(e.message));
  await visitor.goto(url, { waitUntil: 'networkidle' });
  await visitor.getByRole('heading', { level: 1 }).waitFor();
  check(
    await visitor
      .getByText(/\d 层 · 建筑面积 \d+ ㎡/)
      .first()
      .isVisible(),
    'storeys and area in one line',
  );
  const hero = visitor.locator('[aria-label="效果图"]').first();
  check(await hero.getByRole('slider').isVisible(), 'the hero render over the model, with before/after');
  check((await visitor.locator('[aria-label="所有风格"] img').count()) === 3, 'the styles made');
  check(await visitor.locator('[aria-label="3D 模型和平面图"] canvas').isVisible(), 'the house in 3D');
  await visitor.waitForTimeout(2500);
  await visitor.screenshot({ path: `${OUT}/showcase-2-visitor.png`, fullPage: true });
  const download = visitor.waitForEvent('download');
  await visitor.getByRole('button', { name: '3:4' }).click();
  const file = await download;
  await file.saveAs(`${OUT}/showcase-3-export-3x4.jpg`);
  const sizes = await visitor.evaluate(async () => {
    const { composeExport } = await import('/src/features/showcase/exports.ts');
    const src = document.querySelector('[aria-label="效果图"] img').getAttribute('src');
    const out = {};
    for (const r of ['portrait', 'square', 'story']) {
      const img = new Image();
      img.src = await composeExport(src, r, { title: 't', facts: 'f', label: 'l' });
      await img.decode();
      out[r] = `${img.naturalWidth}x${img.naturalHeight}`;
    }
    return out;
  });
  check(
    sizes.portrait === '1080x1440' && sizes.square === '1080x1080' && sizes.story === '1080x1920',
    `images to post in 3:4, 1:1 and 9:16 (${Object.values(sizes).join(', ')})`,
  );

  // Remix: a copy of the house, the visitor's own
  await visitor.getByRole('button', { name: '复制这套房子来改' }).click();
  await visitor.waitForURL(/\/p\//);
  await visitor.waitForFunction(() => window.artifact?.ready);
  const copy = await visitor.evaluate(() => window.artifact.project());
  check(copy.name.endsWith('（我的版本）') && copy.walls.length > 10, `remixed into "${copy.name}"`);
  const events = sql(`select name from event where project_id = '${id}'`).map(e => e.name);
  check(events.includes('showcase_viewed') && events.includes('remix'), `the funnel counts the visit and the remix (${events.join(', ')})`);

  // The owner takes one image off the page, then stops sharing
  const renders = await owner.evaluate(async id => (await fetch(`/api/projects/${id}/renders`)).json(), id);
  await owner.evaluate(
    ([id, r]) => fetch(`/api/projects/${id}/renders/${r}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"public":false}' }),
    [id, renders[0].id],
  );
  const page = await (await fetch(`${BASE}/api/showcase/${token}`)).json();
  check(page.renders.length === 2, 'an image taken off the page no longer shows');
  const hidden = await fetch(`${BASE}/api/renders/${renders[0].id}/image`);
  check(hidden.status === 404, 'nor can it be fetched');
  await owner.getByRole('button', { name: '停止分享' }).click();
  await owner.getByRole('button', { name: '发布', exact: true }).waitFor();
  check((await fetch(`${BASE}/api/showcase/${token}`)).status === 404, 'stopping sharing turns the link off');
  check((await fetch(`${BASE}/api/renders/${renders[1].id}/image`)).status === 404, 'and its images');
  await visitor.goto(url);
  await visitor.getByText('这个分享页不存在了').waitFor();
  check(true, 'the page says it is gone');
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
