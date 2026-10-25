// E2E: the model axes in 3D → x, y, z in black, named by their heads, crossing at the house's top-left corner → a drag across
// the origin before tapping it turns the camera and moves nothing → a tap on the origin, then its handle drags it on the ground
// (snapping to a corner) → a tap on x offers to copy it, and the copy (x₁) is a guide → a tap on the copy selects it: its side
// handle slides it, its head turns it in 15° steps → a z copy tips over like a fan → undo; on a phone the same with one finger,
// and a second finger calls a drag off
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

const open = async (page, phone = false) => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  // The origin out in the south yard, in front of the house as the camera first looks
  await page.evaluate(async () => window.artifact.call('axes_set', { origin: [9000, 16000] }));
  const button = page.getByRole('button', { name: /三维/ }).first();
  await (phone ? button.tap() : button.click());
  await page.waitForTimeout(6000);
  const iframe = await page.locator('iframe').first().boundingBox();
  /** Where a mark shows on the page */
  const pos = async sel => {
    const r = await frame.evaluate(s => {
      const b = document.querySelector(s)?.getBoundingClientRect();
      return b && [b.x + b.width / 2, b.y + b.height / 2];
    }, sel);
    return r && [iframe.x + r[0], iframe.y + r[1]];
  };
  /** A point `t` of the way from the origin toward an axis's head (its label) */
  const along = async (label, t) => {
    const o = await pos('[data-axes-origin]');
    const h = await pos(`[data-axis-label="${label}"]`);
    return [o[0] + (h[0] - o[0]) * t, o[1] + (h[1] - o[1]) * t];
  };
  const origin = () => frame.evaluate(() => document.querySelector('[data-axes-origin]')?.getAttribute('data-axes-origin'));
  const guides = async () => {
    const found = (await page.evaluate(async () => (await window.artifact.call('find_objects', { type: 'guide' })).result)) ?? [];
    return Promise.all(found.map(g => page.evaluate(async id => (await window.artifact.call('get_object', { ref: id })).result, g.id)));
  };
  return { frame, pos, along, origin, guides };
};
const drag = async (page, from, to, steps = 12) => {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps });
  await page.mouse.up();
  await page.waitForTimeout(500);
};

test('axes in 3D', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const reset = await (async () => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
    const frame = page.frames().find(f => f !== page.mainFrame());
    return frame.evaluate(() => document.querySelector('[data-axes]')?.getAttribute('data-axes'));
  })();
  check(reset === '2030,30', `the origin starts on the house's top-left corner (${reset})`);
  const { frame, pos, along, origin, guides } = await open(page);
  const labels = await frame.evaluate(() => [...document.querySelectorAll('[data-axis-label]')].map(e => e.textContent).join(''));
  check(labels === 'xyz', `the heads are named x, y, z (${labels})`);
  await page.screenshot({ path: `${OUT}/axes-3d.png` });

  // Before a tap, a drag from the origin turns the camera
  const o = await pos('[data-axes-origin]');
  await drag(page, o, [o[0] + 60, o[1] + 10]);
  check((await origin()) === '9000,16000', 'a drag before tapping the origin moves nothing');
  await page.waitForTimeout(800);

  // Tap the origin: move mode; its handle drags it on the ground
  await page.mouse.click(...(await pos('[data-axes-origin]')));
  await page.waitForTimeout(400);
  check(await page.getByText('拖动原点在地面上移动').isVisible(), 'a tap on the origin enters move mode');
  const h = await pos('[data-axes-handle="origin"]');
  const toward = await along('x', 0.25);
  await drag(page, h, toward);
  const moved = await origin();
  check(moved && moved !== '9000,16000', `the handle drags the origin on the ground (${moved})`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  check((await origin()) === '9000,16000', 'undo puts it back');
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForTimeout(300);

  // Tap x: the copy button; the copy is a guide named x₁
  await page.mouse.click(...(await along('x', 0.4)));
  await page.waitForTimeout(400);
  const clone = frame.locator('[data-axes-clone="x"]');
  check((await clone.count()) === 1, 'a tap on x offers to copy it');
  await clone.click();
  await page.waitForTimeout(500);
  let [x1] = await guides();
  check(x1?.name === 'x₁' && x1.axis === 'x' && x1.at[1] === 16000, `the copy is a guide x₁ on the axis (${x1?.name} ${JSON.stringify(x1?.at)})`);
  check((await frame.locator('[data-axes-handle="slide"]').count()) === 2, 'the new copy is selected, with a handle on each side');

  // Slide it across itself (north, toward the house) by the side handle higher on screen, then turn it by its head
  const s = await (async () => {
    const r = await frame.evaluate(
      () =>
        [...document.querySelectorAll('[data-axes-handle="slide"]')]
          .map(e => e.getBoundingClientRect())
          .map(b => [b.x + b.width / 2, b.y + b.height / 2])
          .sort((a, b) => a[1] - b[1])[0],
    );
    const f = await page.locator('iframe').first().boundingBox();
    return [f.x + r[0], f.y + r[1]];
  })();
  const y = await along('y', 0.15);
  const o2 = await pos('[data-axes-origin]');
  await drag(page, s, [s[0] - (y[0] - o2[0]), s[1] - (y[1] - o2[1])]);
  [x1] = await guides();
  check(x1.at[1] < 16000 && x1.at[0] === 9000, `the side handle slides it across itself (${JSON.stringify(x1.at)})`);
  await page.screenshot({ path: `${OUT}/axes-3d-slid.png` });
  const tip = await pos('[data-axes-handle="turn"]');
  await drag(page, tip, [tip[0] - 40, tip[1] - 160], 16);
  [x1] = await guides();
  const deg = (Math.atan2(x1.dir[1], x1.dir[0]) * 180) / Math.PI;
  check(Math.abs(Math.round(deg / 15) * 15 - deg) < 0.01 && Math.abs(deg) > 1 && x1.dir[2] === 0, `the head turns it level in 15° steps (${deg.toFixed(2)}°)`);

  // A z copy tips over like a fan
  await page.mouse.click(...(await pos('[data-axes-origin]')));
  await page.getByRole('button', { name: '完成' }).click();
  await page.mouse.click(...(await along('z', 0.4)));
  await page.waitForTimeout(400);
  await frame.locator('[data-axes-clone="z"]').click();
  await page.waitForTimeout(500);
  const ztip = await pos('[data-axes-handle="turn"]');
  const xHead = await along('x', 0.5);
  await drag(page, ztip, xHead, 16);
  const z1 = (await guides()).find(g => g.name === 'z₁');
  const tilt = (Math.acos(z1.dir[2]) * 180) / Math.PI;
  check(tilt > 1 && Math.abs(Math.round(tilt / 15) * 15 - tilt) < 0.05, `the z copy tips over in 15° steps (${tilt.toFixed(1)}°)`);
  await page.screenshot({ path: `${OUT}/axes-3d-fan.png` });
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

test('axes in 3D on a phone', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { frame, pos, along, origin, guides } = await open(page, true);
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const swipe = async (from, to, steps = 10) => {
    await touch('touchStart', [from]);
    for (let i = 1; i <= steps; i++) await touch('touchMove', [[from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps]]);
  };
  await page.touchscreen.tap(...(await pos('[data-axes-origin]')));
  await page.waitForTimeout(500);
  check((await frame.locator('[data-axes-handle="origin"]').count()) === 1, 'a tap on the origin enters move mode');
  const h = await pos('[data-axes-handle="origin"]');
  const toward = await along('x', 0.3);
  await swipe(h, toward);
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  const moved = await origin();
  check(moved !== '9000,16000', `a finger drags the origin (${moved})`);

  // Copy x with taps, then slide the copy with a finger
  await page.getByRole('button', { name: '完成' }).tap({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.touchscreen.tap(...(await along('x', 0.7)));
  await page.waitForTimeout(500);
  await frame.locator('[data-axes-clone="x"]').tap({ timeout: 5000 });
  await page.waitForTimeout(600);
  const [x1] = await guides();
  check(x1?.name === 'x₁', `a tap copies x (${x1?.name})`);
  const s = await pos('[data-axes-handle="slide"]');
  await swipe(s, [s[0], s[1] - 60]);
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  const [after] = await guides();
  check(after.at[1] !== x1.at[1] && after.at[0] === x1.at[0], `a finger slides the copy across itself (${JSON.stringify(after.at)})`);
  await page.screenshot({ path: `${OUT}/axes-3d-phone.png` });

  // A second finger calls a drag off
  await page.touchscreen.tap(...(await pos('[data-axes-origin]')));
  await page.waitForTimeout(500);
  const h2 = await pos('[data-axes-handle="origin"]');
  await swipe(h2, [h2[0] + 40, h2[1]], 6);
  await touch('touchStart', [
    [h2[0] + 40, h2[1]],
    [h2[0] + 140, h2[1] + 140],
  ]);
  await touch('touchMove', [
    [h2[0] + 50, h2[1]],
    [h2[0] + 160, h2[1] + 160],
  ]);
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  check((await origin()) === moved, `a second finger cancels the drag (${await origin()})`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
