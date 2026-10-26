// E2E: the agent and widgets (#162): installs a library widget from words, tunes it, writes one of the design's own (tried in
// the sandbox first), and the canvas draws them all
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('agent widgets', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const api = (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, { ...i, headers: { 'Content-Type': 'application/json' } });
        return { status: r.status, body: await r.json() };
      },
      [path, init],
    );
  await api('/keys', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'compatible',
      model: 'fake-model',
      apiKey: 'sk-test-12345678',
      baseUrl: process.env.FAKE_LLM ?? 'http://127.0.0.1:8787/v1',
    }),
  });
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);

  const box = page.getByPlaceholder('说说想怎么改…');
  const project = () => page.evaluate(() => window.artifact.project());
  // The canvas iframe (the widget sandbox's own iframe has an opaque origin, so no document to read)
  const inCanvas = selector =>
    page.evaluate(
      sel =>
        [...document.querySelectorAll('iframe')]
          .flatMap(f => [...(f.contentDocument?.querySelectorAll(sel) ?? [])])
          .map(e => ({ cx: e.getAttribute('cx'), cy: e.getAttribute('cy') })),
      selector,
    );
  const until = async (fn, what) => {
    for (let i = 0; i < 60; i++) {
      if (await fn()) return check(true, what);
      await page.waitForTimeout(250);
    }
    check(false, what);
  };
  const say = async (words, reply) => {
    await box.fill(words);
    await box.press('Enter');
    await page.getByText(reply).first().waitFor({ timeout: 30000 });
  };

  // "Add a 3.6 m grid": widget_catalog → widget_install
  await say('加一个 3.6 米的轴网', /^加好了：3.6 米的轴网/);
  let p = await project();
  check(p.widgets.length === 1 && p.widgets[0].widget.id === 'grid' && p.widgets[0].params.spacing === 3600, `grid installed: ${JSON.stringify(p.widgets)}`);
  const grid = p.widgets[0].id;
  await until(async () => (await inCanvas(`[data-widget="${grid}"][data-widget-item="line"]`)).length > 0, 'the grid is drawn in the plan');

  // "Move the origin to the south-east corner": project_summary bounds → widget_configure
  await say('把轴网原点挪到东南角', /^好了，轴网原点挪到了房子的东南角/);
  p = await project();
  const summary = await page.evaluate(() => window.artifact.call('project_summary', {}));
  const [, , maxX, maxY] = summary.result.levels[0].bounds;
  check(
    p.widgets[0].params.originX === maxX && p.widgets[0].params.originY === maxY,
    `origin at the south-east corner: ${JSON.stringify(p.widgets[0].params)}`,
  );
  await until(async () => {
    const [h] = await inCanvas(`[data-widget="${grid}"][data-widget-handle]`);
    return h && Math.abs(Number(h.cx) - maxX) < 1 && Math.abs(Number(h.cy) - maxY) < 1;
  }, 'the origin handle moved there');

  // "Make a widget that marks every room's centre": widget_create (tried in the sandbox), saved in the design, installed
  await say('做一个标出每个房间中心的组件', /^做好了：标出了 \d+ 个房间的中心/);
  p = await project();
  const own = Object.keys(p.library.widgets ?? {});
  check(own.length === 1, `saved in the design: ${own.join(', ')}`);
  const mine = p.widgets.find(w => w.widget.library === 'design');
  check(mine && mine.name === '房间中心' && mine.widget.id === own[0], `installed: ${JSON.stringify(mine)}`);
  const level = new URL(page.url()).searchParams.get('level') ?? p.levels[0].id;
  const rooms = p.spaces.filter(s => s.level === level && s.kind !== 'void').length;
  const reply = await page
    .getByText(/^做好了：标出了 \d+ 个房间的中心/)
    .first()
    .innerText();
  check(reply.includes(` ${rooms} 个`), `the trial run counted the rooms (${rooms}): ${reply}`);
  await until(
    async () => (await inCanvas(`[data-widget="${mine.id}"][data-widget-item="point"]`)).length === rooms,
    `the canvas draws a point in each of the ${rooms} rooms`,
  );
  check((await inCanvas(`[data-widget="${mine.id}"][data-widget-item="label"]`)).length === rooms, 'with the room names');
  await page.screenshot({ path: `${OUT}/agent-widgets.png` });

  // It is the design's: it survives a reload and is configured like a library widget
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  await until(async () => (await inCanvas(`[data-widget="${mine.id}"][data-widget-item="point"]`)).length > 0, 'drawn again after a reload');
  const labels = await page.evaluate(id => window.artifact.call('widget_configure', { widget: id, params: { labels: false } }), mine.id);
  check(labels.ok, 'configured like a library widget');
  await until(async () => (await inCanvas(`[data-widget="${mine.id}"][data-widget-item="label"]`)).length === 0, 'its labels go when turned off');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
