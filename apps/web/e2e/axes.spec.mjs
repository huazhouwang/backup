// E2E: the model axes → panning across the origin changes nothing → a click on the origin knob selects them → the origin drags
// onto the house's north-west corner → the knob on red turns them in 15° steps → dragging red draws a parallel guide → a wall
// tap aligns red with it → undo, and reset from the ⋯ menu → a wall next to the moved origin is still picked by a tap; on a phone
// a finger moves the origin, and a second finger calls the drag off
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

const open = async page => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const iframe = await page.locator('iframe[title="画布"], iframe[title="Canvas"]').first().boundingBox();
  const at = async (x, y) => {
    const q = await frame.evaluate(
      ([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(document.querySelector('svg[role="img"]').getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
    return [iframe.x + q[0], iframe.y + q[1]];
  };
  const axes = () => frame.evaluate(() => document.querySelector('[data-axes]')?.getAttribute('data-axes'));
  return { frame, at, axes };
};
const drag = async (page, from, to) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
};
const selection = page => page.evaluate(async () => (await window.artifact.call('view_get', {})).result.selection.map(s => s.id ?? s));

test('axes', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { frame, at, axes } = await open(page);
  check((await axes()) === 'world', 'the world axes to begin with');

  // Not selected: a drag across the origin pans, the axes stay
  const o = await at(0, 0);
  await drag(page, o, [o[0] + 120, o[1] + 80]);
  check((await axes()) === 'world', 'a drag from the origin before selecting the axes leaves them');

  // Select them
  const o2 = await at(0, 0);
  await page.mouse.click(...o2);
  await page.waitForTimeout(300);
  check((await frame.locator('[data-axes-edit]').count()) === 1, 'a click on the origin knob selects the axes');
  check(await page.getByText('拖原点移动').isVisible(), 'the hint says what the handles do');

  // The origin onto the north-west corner (2030, 30)
  await drag(page, o2, await at(2040, 40));
  check((await axes()) === '2030,30@0', `the origin snaps onto the corner (${await axes()})`);
  await page.screenshot({ path: `${OUT}/axes-moved.png` });

  // Turn: the knob stands 90 px along red; drag it 30° clockwise
  const c = await at(2030, 30);
  const knob = [c[0] + 90, c[1]];
  const r = 200;
  await drag(page, knob, [c[0] + r * Math.cos(Math.PI / 6), c[1] + r * Math.sin(Math.PI / 6)]);
  check((await axes()) === '2030,30@30', `the knob turns them by 15° steps (${await axes()})`);
  await page.screenshot({ path: `${OUT}/axes-turned.png` });

  // Off red (at 160 px from the origin): a guide parallel to it
  const along = [c[0] + 160 * Math.cos(Math.PI / 6), c[1] + 160 * Math.sin(Math.PI / 6)];
  await page.mouse.move(...along);
  await page.mouse.down();
  await page.mouse.move(along[0] - 40, along[1] + 70, { steps: 10 });
  const shown = await frame.evaluate(() => document.querySelector('[data-guide-draft]')?.textContent);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const gs = (await page.evaluate(async () => (await window.artifact.call('find_objects', { type: 'guide' })).result)) ?? [];
  const g = gs[0] && (await page.evaluate(async id => (await window.artifact.call('get_object', { ref: id })).result, gs[0].id));
  check(!!shown && !!g && Math.abs(g.dir[0] - Math.cos(Math.PI / 6)) < 1e-3, `dragging red draws a guide parallel to it (${shown}, ${JSON.stringify(g?.dir)})`);

  // Align to a wall: the north wall runs east, so red goes back to 0°
  await page.getByRole('button', { name: '对齐墙' }).click();
  await page.mouse.click(...(await at(6000, 120)));
  await page.waitForTimeout(400);
  check((await axes()) === '2030,30@0', `a wall tap aligns red with it (${await axes()})`);

  // Undo goes back to 30°, the ⋯ menu resets
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  check((await axes()) === '2030,30@30', `undo turns them back (${await axes()})`);
  await page.getByRole('button', { name: '完成' }).click();
  check((await frame.locator('[data-axes-edit]').count()) === 0, 'done puts the handles away');

  // The north wall right next to the moved origin (a window in it) is still picked by a click
  await page.mouse.click(...(await at(2030 + 800, 120)));
  await page.waitForTimeout(300);
  const sel = await selection(page);
  check(
    sel.length === 1 && (await frame.locator('[data-axes-edit]').count()) === 0,
    `a click on the wall by the origin picks what is there, not the axes (${sel})`,
  );

  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitem', { name: '重置坐标轴' }).click();
  await page.waitForTimeout(300);
  check((await axes()) === 'world', 'the ⋯ menu resets them');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

test('axes on a phone', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { at, axes, frame } = await open(page);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const swipe = async (from, to, steps = 10) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
  };
  const o = await at(0, 0);
  await page.touchscreen.tap(...o);
  await page.waitForTimeout(400);
  check((await frame.locator('[data-axes-edit]').count()) === 1, 'a tap on the origin knob selects the axes');

  // One finger moves the origin
  await swipe(o, [o[0] + 60, o[1] + 40]);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  const moved = await axes();
  check(moved !== 'world', `a finger drags the origin (${moved})`);

  // A second finger calls the drag off
  const o3 = await at(...moved.split('@')[0].split(',').map(Number));
  await swipe(o3, [o3[0] + 50, o3[1]], 6);
  await touch('touchStart', [
    [o3[0] + 50, o3[1]],
    [o3[0] + 150, o3[1] + 150],
  ]);
  await touch('touchMove', [
    [o3[0] + 60, o3[1]],
    [o3[0] + 170, o3[1] + 170],
  ]);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/axes-phone.png` });
  check((await axes()) === moved, `a second finger cancels the drag (${await axes()})`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
