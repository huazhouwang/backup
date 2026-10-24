// E2E: the tape measure → in the plan, two clicks across the living room (snapping onto the wall faces) read the clear width →
// in 3D, two taps on the model read a distance → Esc puts it away
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

  // 3D: two taps on the model
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(5000);
  if (!(await page.getByRole('button', { name: '卷尺', pressed: true }).count())) await page.getByRole('button', { name: '卷尺' }).click();
  const box = await page.locator('iframe').first().boundingBox();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.6);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/measure-3d.png` });
  const label = await frame.evaluate(() => [...document.querySelectorAll('div')].map(d => d.textContent).find(t => /^\d+$/.test(t ?? '')));
  check(!!label && Number(label) > 0, `two taps on the model read a distance (${label} mm)`);

  await page.keyboard.press('Escape');
  check(!(await page.getByRole('button', { name: '卷尺', pressed: true }).count()), 'Esc puts the tape measure away');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
