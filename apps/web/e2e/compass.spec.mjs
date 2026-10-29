// E2E: the compass → in the plan it points to the drawing's north, the old north arrow is gone → in 3D it turns with the view and
// a tap turns the view to look north → the 日照 button opens the date and time, and moving the time moves the sun and the shadows
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('compass', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  /** The needle's turn (degrees clockwise from up) */
  const needle = async () => Number((await page.locator('svg g[transform^="rotate("]').first().getAttribute('transform')).match(/rotate\(([-\d.e]+)/)[1]);
  check((await needle()) === 0 && (await page.getByRole('img', { name: '指北针' }).isVisible()), "in the plan the compass points up, to the drawing's north");
  const north = await frame.evaluate(() => [...document.querySelectorAll('svg text')].some(t => t.textContent === '北'));
  check(!north, "the plan's old north arrow is gone");

  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  // Once the house has grown out of the plan, the view looks from the south-west
  let turned = 0;
  for (let i = 0; i < 30 && Math.abs(turned) <= 10; i++) {
    await page.waitForTimeout(500);
    turned = await needle();
  }
  check(Math.abs(turned) > 10, `in 3D the needle turns with the view (${turned.toFixed(0)}°)`);
  await page.getByRole('button', { name: '朝北看' }).click();
  // The view eases round frame by frame: wait until it has (software GL draws a few frames a second)
  for (let i = 0; i < 40 && Math.abs(turned) >= 2; i++) {
    await page.waitForTimeout(500);
    turned = await needle();
  }
  check(Math.abs(turned) < 2, `a tap turns the view to look north (${turned.toFixed(1)}°)`);

  // The sun: a morning time moves it east and the shadows with it
  const canvas = page.locator('iframe').first();
  const afternoon = await canvas.screenshot();
  await page.getByRole('button', { name: '调整日照' }).click();
  const told = () => page.locator('[data-slot=popover-content]').textContent();
  const before = await told();
  check(/太阳高度 \d+°，方位 \d+°/.test(before), `the sun's height and bearing (${before.match(/太阳高度[^日]*/)?.[0]})`);
  const track = await page.locator('[data-slot=slider-track]').nth(1).boundingBox();
  await page.mouse.click(track.x + track.width * 0.33, track.y + track.height / 2);
  await page.waitForTimeout(800);
  const after = await told();
  const bearing = Number(after.match(/方位 (\d+)°/)?.[1]);
  check(/0[78]:\d0/.test(after) && bearing > 60 && bearing < 130, `a morning time puts the sun in the east (${after.match(/方位 \d+°/)?.[0]})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/compass-morning.png` });
  check(!afternoon.equals(await canvas.screenshot()), 'the light and shadows follow the sun');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
