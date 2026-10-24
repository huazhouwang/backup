// E2E: walking through → the camera menu's walk mode stands at eye height in a room → W walks forward → Esc returns to the orbit
// view; on a phone the joystick walks, a finger drag looks around, a tap on the floor walks there, and the button in the hint leaves
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('walk', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(5000);
  const cameraButton = () => page.getByRole('button', { name: '相机' });
  await cameraButton().click();
  await page.getByRole('menuitemcheckbox', { name: '漫游' }).click();
  await page.waitForTimeout(1500);
  check((await cameraButton().textContent())?.includes('漫游'), 'the camera menu enters walk mode');
  const canvas = page.locator('iframe').first();
  const before = await canvas.screenshot();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  const after = await canvas.screenshot();
  await page.screenshot({ path: `${OUT}/walk.png` });
  check(!before.equals(after), 'W walks forward (the view changes)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  check(!(await cameraButton().textContent())?.includes('漫游'), 'Esc returns to the orbit view');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

test('walk on a phone', async ({ browser: b }) => {
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
  await page.getByRole('button', { name: '相机' }).tap();
  await page.getByRole('menuitemcheckbox', { name: '漫游' }).tap();
  await page.waitForTimeout(1500);
  const canvas = page.locator('iframe').first();
  const stick = frame.getByRole('slider', { name: '移动摇杆' });
  check(await stick.isVisible(), 'walking on a phone shows the joystick');
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const drag = async (from, to, ms) => {
    await touch('touchStart', ...from);
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await page.waitForTimeout(ms / steps);
    }
    await touch('touchEnd');
    await page.waitForTimeout(300);
  };
  // The joystick: push the knob up to walk forward
  const s = await stick.boundingBox();
  const frameBox = await canvas.boundingBox();
  // (a frame element's box is already in page coordinates)
  const c = [s.x + s.width / 2, s.y + s.height / 2];
  const before = await canvas.screenshot();
  await drag(c, [c[0], c[1] - 40], 900);
  const walked = await canvas.screenshot();
  await page.screenshot({ path: `${OUT}/walk-phone.png` });
  check(!before.equals(walked), 'pushing the joystick walks (the view changes)');
  // A drag elsewhere looks around
  const mid = [frameBox.x + frameBox.width * 0.6, frameBox.y + frameBox.height * 0.4];
  await drag(mid, [mid[0] - 80, mid[1]], 400);
  check(!walked.equals(await canvas.screenshot()), 'a finger drag looks around');
  // A tap on the floor walks there
  const looked = await canvas.screenshot();
  await page.touchscreen.tap(frameBox.x + frameBox.width * 0.5, frameBox.y + frameBox.height * 0.8);
  await page.waitForTimeout(2000);
  check(!looked.equals(await canvas.screenshot()), 'a tap on the floor walks there');
  await page.getByRole('button', { name: '退出漫游' }).tap();
  await page.waitForTimeout(800);
  check(!(await stick.count()), 'the hint button leaves walking');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
