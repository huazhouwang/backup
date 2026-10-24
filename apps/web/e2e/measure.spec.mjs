// E2E: the tape measure → in the plan, two clicks across the living room (snapping onto the wall faces) read the clear width →
// in 3D, a click starts the tape, it follows the pointer locking onto an axis, a click ends it; on a phone one finger drags it → Esc puts it away
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('measure', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
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

  // Plan: from just inside the north wall's inner face (y = 210) to just inside the living room's south wall (6360 - 90)
  await page.getByRole('button', { name: '卷尺' }).click();
  for (const [x, y] of [
    [7000, 225],
    [7000, 6255],
  ])
    await page.mouse.click(...(await at(x, y)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/measure-plan.png` });
  const texts = await frame.evaluate(() => [...document.querySelectorAll('[data-feedback] text')].map(t => t.textContent));
  check(texts.includes('6060'), `two clicks snapped to the wall faces read 6060 mm (${texts.join(', ')})`);

  // 3D: a click sets the start, the tape follows the pointer and locks onto an axis, a second click ends it
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(5000);
  if (!(await page.getByRole('button', { name: '卷尺', pressed: true }).count())) await page.getByRole('button', { name: '卷尺' }).click();
  // Let the camera settle after growing the house
  await page.waitForTimeout(3000);
  const box = await page.locator('iframe').first().boundingBox();
  const start = [box.x + box.width * 0.45, box.y + box.height * 0.55];
  await page.mouse.click(...start);
  const tapes = () =>
    frame.evaluate(() =>
      [...document.querySelectorAll('[data-measure]')].map(d => ({ mm: Number(d.dataset.measure), color: d.style.color, text: d.textContent })),
    );
  // Sweep round the start: some directions lock onto an axis (the tape turns red, green or blue)
  let locked = null;
  for (let deg = 0; deg < 360 && !locked; deg += 5) {
    const r = (deg * Math.PI) / 180;
    await page.mouse.move(start[0] + 110 * Math.cos(r), start[1] + 110 * Math.sin(r));
    await page.waitForTimeout(120);
    const live = (await tapes()).find(t => /--axis-/.test(t.color));
    if (live) locked = { deg, live };
  }
  check(!!locked, `the live tape locks onto an axis (${locked?.live.color} at ${locked?.deg}°)`);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/measure-3d.png` });
  const done = await tapes();
  check(done.length === 1 && done[0].mm > 0 && /--axis-/.test(done[0].color), `a second click keeps the measurement on the axis (${JSON.stringify(done)})`);

  await page.keyboard.press('Escape');
  check(!(await page.getByRole('button', { name: '卷尺', pressed: true }).count()), 'Esc puts the tape measure away');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

// On a phone: a tap sets the start, one finger drags the tape's end (instead of orbiting) and lifting sets it
test('measure on a phone', async ({ browser: b }) => {
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .tap();
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: '卷尺' }).tap();
  const box = await page.locator('iframe').first().boundingBox();
  const start = [box.x + box.width * 0.45, box.y + box.height * 0.5];
  await page.touchscreen.tap(...start);
  await page.waitForTimeout(300);
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const tapes = () => frame.evaluate(() => [...document.querySelectorAll('[data-measure]')].map(d => Number(d.dataset.measure)));
  await touch('touchStart', start[0] + 10, start[1] + 10);
  for (let i = 1; i <= 10; i++) await touch('touchMove', start[0] + 10 + i * 9, start[1] + 10 + i * 4);
  await page.waitForTimeout(200);
  check((await tapes()).length === 1, 'dragging one finger draws the tape live');
  await touch('touchEnd');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/measure-3d-phone.png` });
  const done = await tapes();
  check(done.length === 1 && done[0] > 0, `lifting the finger sets the end (${done.join(', ')} mm)`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
