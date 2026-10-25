// E2E: section planes → a section line drawn in the plan cuts the 3D model and the model still orbits → the section bar flips it and
// clears it
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('views', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const canvas = page.locator('iframe[title="画布"], iframe[title="Canvas"]').first();
  const iframe = await canvas.boundingBox();
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
  const datums = () => frame.evaluate(() => [...document.querySelectorAll('div')].filter(d => /^[±+-]\d+\.\d{3} /.test(d.textContent ?? '')).length);
  const drag = async (dx, dy) => {
    const cx = iframe.x + iframe.width / 2;
    const cy = iframe.y + iframe.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
  };

  // A section east to west through the living room: 3D turns to face it, cut, with the levels as datums
  await page.getByRole('button', { name: '剖切' }).click();
  await page.mouse.click(...(await at(17900, 2500)));
  await page.mouse.click(...(await at(1500, 2500)));
  await page.waitForTimeout(3500);
  check(await page.getByText('剖切中').isVisible(), 'drawing a section line opens 3D with the section bar');
  check((await datums()) >= 4, `the section shows the levels as datums (${await datums()})`);
  await page.screenshot({ path: `${OUT}/views-section.png` });
  // The section is a plane in the model, not a locked view: dragging orbits around it
  const facing = await canvas.screenshot();
  await drag(-220, 60);
  await page.screenshot({ path: `${OUT}/views-section-orbit.png` });
  check(!facing.equals(await canvas.screenshot()), 'the sectioned model still orbits');
  check((await datums()) >= 4, 'and stays cut');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: '反方向看' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/views-section-flip.png` });
  check(!before.equals(await canvas.screenshot()) && (await datums()) >= 4, 'the section bar flips the section');
  await page.getByRole('button', { name: '取消剖切' }).click();
  await page.waitForTimeout(800);
  check((await datums()) === 0 && !(await page.getByText('剖切中').count()), 'the section bar clears the section');
  check(!(await page.getByRole('button', { name: '相机' }).count()), 'there is no camera menu');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
