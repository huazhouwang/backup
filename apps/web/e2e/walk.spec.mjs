// E2E: walking through, as wushi-amr's walk → the 漫游 toggle stands you at eye height with a crosshair → W walks, walls stop you,
// the stairs lead up to the next level (the level switcher follows) → the level switcher goes to that level's start → Esc leaves;
// on a phone a finger on the left walks with a joystick where it lands while another on the right looks around
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

const open = async page => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  return page.frames().find(f => f !== page.mainFrame());
};
/** Where the walker stands (the canvas exposes it in development) */
const probe = frame => frame.evaluate(() => window.walkProbe?.get());
const place = (frame, at) => frame.evaluate(at => window.walkProbe.set(at), at);
const levelOn = page =>
  page
    .locator('[aria-pressed="true"]')
    .filter({ hasText: /^(一层|二层|三层|屋顶)$/ })
    .textContent();

test('walk', async ({ browser: b }) => {
  test.setTimeout(240_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const frame = await open(page);
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(5000);
  const walkButton = page.getByRole('button', { name: '漫游' });
  await walkButton.click();
  await page.waitForTimeout(1500);
  check(await page.getByRole('button', { name: '漫游', pressed: true }).isVisible(), 'the 漫游 toggle enters walking');
  const start = await probe(frame);
  check(Math.abs(start.foot) < 0.05 && start.level === 'L1', `you stand on the ground floor (${start.foot.toFixed(2)} m, ${start.level})`);
  check(!(await page.getByRole('button', { name: '相机' }).count()), 'there is no camera menu');

  // W walks forward
  const canvas = page.locator('iframe').first();
  const before = await canvas.screenshot();
  await page.keyboard.down('w');
  await page.waitForTimeout(1200);
  await page.keyboard.up('w');
  await page.waitForTimeout(300);
  const moved = await probe(frame);
  check(Math.hypot(moved.x - start.x, moved.z - start.z) > 0.2 && !before.equals(await canvas.screenshot()), 'W walks forward');

  // Into the living room's north wall (its inside face at y = 210 mm): it stops you a body away
  await place(frame, { x: 7, z: 1.2, yaw: 0, pitch: 0 });
  await page.keyboard.down('w');
  await page.waitForTimeout(4000);
  await page.keyboard.up('w');
  const wall = await probe(frame);
  check(wall.z > 0.21 + 0.2, `the wall stops you (${wall.z.toFixed(2)} m from the north edge)`);

  // Out through the glass sliding door in the south wall: it opens as you come near (windows stop you)
  const door = await page.evaluate(async () => {
    const found = (await window.artifact.call('find_objects', { query: '推拉门', type: 'opening', level: 'L1' })).result[0];
    return (await window.artifact.call('get_object', { ref: found.id })).result;
  });
  const [dx, dy] = door.center;
  // Stand back from it: it is closed, two glass leaves meeting in the middle
  await place(frame, { x: dx / 1000, z: dy / 1000 - 3.5, yaw: Math.PI, pitch: -0.05 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/walk-door-closed.png` });
  // Come near: it slides open into the wall
  await place(frame, { x: dx / 1000, z: dy / 1000 - 1.6 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/walk-door-open.png` });
  // And you walk out
  await page.keyboard.down('w');
  await page.waitForTimeout(4500);
  await page.keyboard.up('w');
  const out = await probe(frame);
  check(out.z * 1000 > dy + 300, `the glass sliding door opens as you come near and you walk out (${Math.round(out.z * 1000 - dy)} mm past it)`);

  // Up the stairs: north up the west flight, east across the landing, south down the east one to the first floor
  await place(frame, { x: 15.55, z: 5.2, yaw: 0, pitch: 0 });
  const walkFor = async (yaw, ms) => {
    await place(frame, { yaw });
    await page.keyboard.down('w');
    await page.waitForTimeout(ms);
    await page.keyboard.up('w');
  };
  await walkFor(0, 9000);
  await walkFor(-Math.PI / 2, 1500);
  await walkFor(Math.PI, 9000);
  const up = await probe(frame);
  await page.screenshot({ path: `${OUT}/walk-upstairs.png` });
  check(up.foot > 3.5 && up.level === 'L2', `the stairs lead up to the first floor (${up.foot.toFixed(2)} m, ${up.level})`);
  check((await levelOn(page)) === '二层', 'the level switcher follows');

  // The level switcher goes to that level's start
  await page.getByRole('button', { name: '三层', exact: true }).click();
  await page.waitForTimeout(1500);
  const third = await probe(frame);
  check(third.level === 'L3' && Math.abs(third.foot - 6.9) < 0.1, `the level switcher goes to that level (${third.foot.toFixed(2)} m)`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  check(!(await page.getByRole('button', { name: '漫游', pressed: true }).count()), 'Esc leaves walking');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

test('walk on a phone', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const frame = await open(page);
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .tap();
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: '漫游' }).tap();
  await page.waitForTimeout(1500);
  const box = await page.locator('iframe').first().boundingBox();
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const start = await probe(frame);
  // Left thumb down: a joystick where it lands; right thumb down to look around
  const left = [box.x + box.width * 0.2, box.y + box.height * 0.7];
  const right = [box.x + box.width * 0.75, box.y + box.height * 0.5];
  await touch('touchStart', [left]);
  await touch('touchStart', [left, right]);
  await page.waitForTimeout(200);
  const stick = frame.getByRole('slider', { name: '移动摇杆' });
  check(await stick.isVisible(), 'a finger on the left brings up a joystick');
  const s = await stick.boundingBox();
  check(Math.hypot(s.x + s.width / 2 - left[0], s.y + s.height / 2 - left[1]) < 4, 'where the finger landed');
  // Both at once: push the stick up and drag the right thumb sideways
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [
      [left[0], left[1] - Math.min(40, i * 5)],
      [right[0] - i * 6, right[1]],
    ]);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/walk-phone.png` });
  const after = await probe(frame);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  check(Math.hypot(after.x - start.x, after.z - start.z) > 0.2, `the left thumb walks (${Math.hypot(after.x - start.x, after.z - start.z).toFixed(2)} m)`);
  check(Math.abs(after.yaw - start.yaw) > 0.1, 'the right thumb looks around at the same time');
  check(!(await stick.count()), 'lifting the thumb puts the joystick away');
  await page.getByRole('button', { name: '退出漫游' }).tap();
  await page.waitForTimeout(800);
  check(!(await page.getByRole('button', { name: '漫游', pressed: true }).count()), 'the hint button leaves walking');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
