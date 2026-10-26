// E2E: the grid task of issue 171, phase C, with the fake model. "按承重墙排一套轴网" → the agent looks for a published wheel,
// reads the wheels and writes a module, tried in the sample-room page; its axes sit on the bearing walls, are selected,
// dragged and renamed in the page, and the wall tool snaps to them. Then it is published to a library as a wheel and
// imported into another design, as a copy that remembers where it came from.
import { test } from '@playwright/test';
import { BASE, check } from './support.mjs';

test('canvas grid', async ({ browser: b }) => {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  // (also runs in the sandboxed page, which has no storage)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('plinth.sandboxCanvas', '1');
    } catch {}
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/\b40[034]\b/.test(m.text()) && errors.push(m.text()));

  const openSample = async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
  };
  const frameOf = async () => {
    await page.locator('iframe[data-sandbox-canvas][data-ready]').waitFor({ timeout: 30000 });
    return (await page.locator('iframe[data-sandbox-canvas]').elementHandle()).contentFrame();
  };
  const api = (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, { ...i, headers: { 'Content-Type': 'application/json' } });
        return { status: r.status, body: await r.json() };
      },
      [path, init],
    );
  const project = () => page.evaluate(() => window.artifact.project());
  const until = async (fn, what) => {
    for (let i = 0; i < 60; i++) {
      if (await fn()) return check(true, what);
      await page.waitForTimeout(200);
    }
    check(false, what);
  };
  const say = async (words, reply) => {
    const box = page.getByPlaceholder('说说想怎么改…');
    await box.fill(words);
    await box.press('Enter');
    await page.getByText(reply).first().waitFor({ timeout: 30000 });
  };

  await openSample();
  await api('/keys', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'compatible',
      model: 'fake-model',
      apiKey: 'sk-test-12345678',
      baseUrl: process.env.FAKE_LLM ?? 'http://127.0.0.1:8787/v1',
    }),
  });
  const lib = (await api('/widget-libraries', { method: 'POST', body: JSON.stringify({ name: '我的轮子' }) })).body.id;
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  let frame = await frameOf();

  // The agent writes the grid module; it was tried in the page before being saved
  const t0 = Date.now();
  await say('按承重墙排一套轴网', /轴网排好了/);
  const grid = (await project()).canvas?.modules?.find(x => x.id === 'structural-grid');
  check(!!grid && grid.version === 1, `the agent saved its grid module, tried first (${Date.now() - t0} ms)`);

  // Its axes are on the bearing walls of the level shown
  const p0 = await project();
  // The sample opens on its first level
  const levelId = p0.levels[0].id;
  const bearing = p0.walls.filter(w => w.level === levelId && w.kind === 'bearing');
  const xs = new Set(bearing.filter(w => Math.abs(w.start[0] - w.end[0]) < 1).map(w => Math.round(w.start[0])));
  const ys = new Set(bearing.filter(w => Math.abs(w.start[1] - w.end[1]) < 1).map(w => Math.round(w.start[1])));
  await until(async () => (await frame.locator('[data-axis-line]').count()) > 0, 'its axes are drawn in the page');
  const axes = await frame.locator('[data-axis-line]').count();
  check(axes === xs.size + ys.size, `one axis per bearing wall line (${axes} = ${xs.size} + ${ys.size})`);
  check(
    (await frame.locator('[data-axis-label="x0"] text').textContent()) === '1' && (await frame.locator('[data-axis-label="y0"] text').textContent()) === 'A',
    'numbered across, lettered down',
  );

  // Click selects an axis
  const hit = frame.locator('[data-axis="x0"]');
  const box0 = await hit.boundingBox();
  const mid = { x: box0.x + box0.width / 2, y: box0.y + box0.height * 0.5 };
  await page.mouse.click(mid.x, mid.y);
  await until(async () => (await frame.locator('[data-axis-line="x0"][data-selected]').count()) === 1, 'a click selects an axis');

  // Drag moves it, and the move is kept in the module's data (undoable)
  const x0 = Math.min(...xs);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 20, mid.y, { steps: 4 });
  await page.mouse.move(mid.x + 40, mid.y, { steps: 4 });
  await page.mouse.up();
  const moved = () => project().then(p => p.canvas?.data?.['structural-grid']?.[levelId]?.axes.find(a => a.id === 'x0')?.at);
  await until(async () => ((await moved()) ?? x0) > x0 + 100, 'dragging moves the axis, kept in the design');
  const at = await moved();
  check(at % 10 === 0, `to a round position (${x0} → ${at})`);

  // Double-click its bubble to rename it
  await frame.locator('[data-axis-label="x0"]').dblclick();
  const input = frame.locator('[data-axis-rename="x0"]');
  await input.waitFor();
  await input.fill('1/A');
  await input.press('Enter');
  await until(async () => (await frame.locator('[data-axis-label="x0"] text').textContent()) === '1/A', 'double-clicking the bubble renames it');
  check((await project()).canvas.data['structural-grid'][levelId].axes.find(a => a.id === 'x0').name === '1/A', 'the name is kept in the design');

  // The wall tool snaps onto the moved axis
  await frame.getByRole('button', { name: '画墙' }).click();
  const box1 = await frame.locator('[data-axis="x0"]').boundingBox();
  const lineX = box1.x + box1.width / 2;
  // In the grid's margin north of the house, clear of furniture (inside, the building rules would refuse a wall through a cabinet)
  const yA = box1.y + box1.height * 0.01,
    yB = box1.y + box1.height * 0.06;
  await page.mouse.click(lineX + 4, yA);
  await page.mouse.click(lineX - 3, yB);
  await until(async () => (await project()).walls.length === p0.walls.length + 1, 'a wall is drawn');
  if ((await project()).walls.length === p0.walls.length) console.log(await page.locator('[data-slot=alert]').allTextContents());
  const wall = (await project()).walls.at(-1);
  check(wall.start[0] === at && wall.end[0] === at, `both of its ends snapped onto the axis (x ${wall.start[0]}, ${wall.end[0]} = ${at})`);
  await page.keyboard.press('Escape');

  // Published to a library as a wheel…
  await say('把轴网发布到组件库', /轴网已发布到组件库/);
  const published = (await api(`/widget-libraries/${lib}`)).body.library.canvasModules?.['structural-grid'];
  check(published?.version === 1 && published.source === grid.source, 'the library has it as a wheel');
  await page.goto(`${BASE}/widgets/${lib}`);
  await page.locator('[data-canvas-modules]').getByText('结构轴网').waitFor();
  check(true, "the library's page shows it");

  // …and imported into another design, as a copy that remembers where it came from
  await openSample();
  frame = await frameOf();
  check(!(await project()).canvas, 'a new design has no modules');
  await say('从组件库导入轴网', /已从组件库导入轴网/);
  const copy = (await project()).canvas?.modules?.find(x => x.id === 'structural-grid');
  check(
    copy?.origin?.library === lib && copy.origin.version === 1 && copy.source === grid.source,
    `imported with its origin (${JSON.stringify(copy?.origin)})`,
  );
  await until(async () => (await frame.locator('[data-axis-line]').count()) === axes, 'it draws the same axes there');

  await api(`/widget-libraries/${lib}`, { method: 'DELETE' });
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
