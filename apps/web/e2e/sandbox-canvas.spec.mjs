// E2E: the sample room (issue 171): the plan drawn by the sandboxed canvas page built from the wheels. It is isolated (no network,
// no access to the editor page or storage), draws the design like the editor, shares the selection with the editor both ways,
// adds walls with the wall tool (snapped to wall ends, undoable), drags furniture through the capabilities, and is refused the
// capabilities a page may not call
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('sandbox canvas', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The isolation check's own fetch is refused by the page's policy, as it should be
  page.on('console', m => m.type() === 'error' && !/Content Security Policy/.test(m.text()) && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const project = () => page.evaluate(() => window.artifact.project());
  const selection = async () => (await page.evaluate(async () => (await window.artifact.call('view_get', {})).result.selection)).map(s => s.id ?? s);

  // ⋯ → 样板间画布 switches the plan to the sandboxed page
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitemcheckbox', { name: '样板间画布（实验）' }).click();
  await page.keyboard.press('Escape');
  const iframe = page.locator('iframe[data-sandbox-canvas]');
  await page.locator('iframe[data-sandbox-canvas][data-ready]').waitFor({ timeout: 30000 });
  const frame = await (await iframe.elementHandle()).contentFrame();
  const perf = await page.evaluate(() => window.opensuSandboxPerf);
  console.log(`perf: first draw ${perf.firstDrawMs} ms, wheels ${(perf.bundleBytes / 1024).toFixed(0)} KB`);
  check(perf.firstDrawMs > 0, 'the sandboxed page draws and says it is ready');

  // Isolated: no network, no editor page, no storage
  const isolation = await frame.evaluate(async () => {
    const out = {};
    try {
      await fetch('/api/me');
      out.fetch = 'reached';
    } catch {
      out.fetch = 'blocked';
    }
    try {
      out.parent = parent.document.title;
    } catch {
      out.parent = 'blocked';
    }
    try {
      localStorage.getItem('x');
      out.storage = 'reached';
    } catch {
      out.storage = 'blocked';
    }
    out.origin = location.origin;
    return out;
  });
  check(
    isolation.fetch === 'blocked' && isolation.parent === 'blocked' && isolation.storage === 'blocked' && isolation.origin === 'null',
    `the page is isolated: ${JSON.stringify(isolation)}`,
  );

  // Draws the design like the editor: every wall on the level has its drawing
  const p0 = await project();
  const level = new URL(page.url()).searchParams.get('level') ?? p0.levels.find(l => !l.roof)?.id ?? p0.levels[0].id;
  const walls = p0.walls.filter(w => w.level === level);
  const drawn = await frame.evaluate(
    ids => ids.filter(id => document.querySelector(`[data-layer="base"] [data-id="${id}"]`)).length,
    walls.map(w => w.id),
  );
  check(drawn === walls.length, `the plan draws the level's walls (${drawn}/${walls.length})`);
  await page.screenshot({ path: `${OUT}/sandbox-canvas-1.png` });

  // Screen position of a plan point (mm) inside the page
  const box = await iframe.boundingBox();
  const screen = async ([x, y]) => {
    const [sx, sy] = await frame.evaluate(
      ([px, py]) => {
        const m = document.querySelector('svg.opensu-plan').getScreenCTM();
        return [px * m.a + py * m.c + m.e, px * m.b + py * m.d + m.f];
      },
      [x, y],
    );
    return [box.x + sx, box.y + sy];
  };

  // A click on a wall selects it in the editor too, and the page stipples it
  const wall = walls.find(w => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]) > 2000);
  const mid = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
  await page.mouse.click(...(await screen(mid)));
  await page.waitForTimeout(300);
  check(JSON.stringify(await selection()) === JSON.stringify([wall.id]), `a click in the page selects the wall in the editor (${await selection()})`);
  check((await frame.locator(`[data-selected="${wall.id}"]`).count()) === 1, 'the page stipples what is selected');
  // The editor clearing the selection clears it in the page
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await selection()).length === 0 && (await frame.locator('[data-selected]').count()) === 0, 'the editor clearing the selection clears the page too');

  // The wall tool: from an existing wall's end (snapped to it exactly), two clicks add a wall; undo takes it away
  await frame.getByRole('button', { name: '画墙' }).click();
  const from = wall.start;
  const [sx, sy] = await screen(from);
  await page.mouse.move(sx + 4, sy + 3);
  await page.mouse.click(sx + 4, sy + 3);
  const to = [from[0] + (wall.end[0] - wall.start[0] === 0 ? 2400 : 0), from[1] + (wall.end[0] - wall.start[0] === 0 ? 0 : 2400)];
  const [tx, ty] = await screen(to);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const p1 = await project();
  const added = p1.walls.filter(w => !p0.walls.some(x => x.id === w.id));
  check(added.length === 1, `two clicks add a wall through wall_add (${added.length})`);
  check(
    added[0] && added[0].start[0] === from[0] && added[0].start[1] === from[1],
    `it starts exactly at the wall end it snapped to (${JSON.stringify(added[0]?.start)} = ${JSON.stringify(from)})`,
  );
  await page.waitForTimeout(300);
  check((await frame.locator(`[data-layer="base"] [data-id="${added[0]?.id}"]`).count()) === 1, 'the page draws the new wall (the change came back as a diff)');
  await page.evaluate(() => window.artifact.call('history_undo', {}));
  await page.waitForTimeout(300);
  check((await project()).walls.length === p0.walls.length, 'undo takes it away');
  await frame.getByRole('button', { name: '选择' }).click();

  // Dragging selected furniture moves it through furniture_move
  const f = p0.furniture.find(x => x.level === level && x.size.w > 600 && x.size.d > 600);
  const [fx, fy] = await screen(f.position);
  await page.mouse.click(fx, fy);
  await page.waitForTimeout(200);
  check(JSON.stringify(await selection()) === JSON.stringify([f.id]), `furniture selected in the page (${await selection()})`);
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx + 20, fy + 10, { steps: 5 });
  await page.mouse.move(fx + 40, fy + 20, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const moved = (await project()).furniture.find(x => x.id === f.id);
  check(
    moved.position[0] !== f.position[0] || moved.position[1] !== f.position[1],
    `dragging moves it (${JSON.stringify(f.position)} → ${JSON.stringify(moved.position)})`,
  );
  await page.screenshot({ path: `${OUT}/sandbox-canvas-2.png` });

  // Capabilities a page may not call are refused
  const refusedCall = await frame.evaluate(async () => (await import('opensu')).bridge.call('view_set', { mode: '3d' }));
  // Modules written before the rename (#179) import the wheels as `plinth`: the same module
  const alias = await frame.evaluate(async () => (await import('plinth')).bridge === (await import('opensu')).bridge);
  check(alias, "the wheels are still importable as 'plinth'");
  check(!refusedCall.ok && refusedCall.error.code === 'forbidden', `a page may not call the editor's view controls (${JSON.stringify(refusedCall.error)})`);

  // Update latency: an edit made in the editor, sent as a diff and drawn by the page (the page reports it)
  await page.evaluate(() => (window.opensuSandboxPerf.update = undefined));
  await page.evaluate(id => window.artifact.call('furniture_move', { furniture: id, by: [100, 0] }), f.id);
  await page.waitForFunction(() => window.opensuSandboxPerf.update !== undefined, null, { timeout: 5000 });
  const update = await page.evaluate(() => window.opensuSandboxPerf.update);
  console.log(`perf: an edit reaches the page and is drawn in ${update} ms`);
  check(update < 1000, `an edit reaches the page quickly (${update} ms)`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
