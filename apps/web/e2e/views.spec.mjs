// E2E: sections and elevations → draw a section line in the plan, 3D shows the section → the view menu switches to an elevation
// and back to perspective → leaving 3D and coming back starts in perspective
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
  const viewButton = () => page.getByRole('button', { name: '视图' });

  // A section east to west through the living room: it looks north
  await page.getByRole('button', { name: '剖切' }).click();
  await page.mouse.click(...(await at(17900, 2500)));
  await page.mouse.click(...(await at(1500, 2500)));
  await page.waitForTimeout(3000);
  check((await viewButton().textContent())?.includes('剖面'), 'drawing a section line opens the section in 3D');
  const datums = await frame.evaluate(() => [...document.querySelectorAll('div')].filter(d => /^[±+-]\d+\.\d{3} /.test(d.textContent ?? '')).length);
  check(datums >= 4, `the section shows the levels as datums (${datums})`);
  await page.screenshot({ path: `${OUT}/views-section.png` });

  // An elevation, then back to perspective
  await viewButton().click();
  await page.getByRole('menuitemradio', { name: '南立面' }).click();
  await page.waitForTimeout(2000);
  check((await viewButton().textContent())?.includes('南立面'), 'the view menu switches to the south elevation');
  await page.screenshot({ path: `${OUT}/views-elevation.png` });
  await viewButton().click();
  await page.getByRole('menuitemradio', { name: '透视' }).click();
  await page.waitForTimeout(1500);
  check((await viewButton().textContent())?.includes('透视'), 'and back to perspective');

  // Leaving 3D in an elevation, 3D comes back in perspective
  await viewButton().click();
  await page.getByRole('menuitemradio', { name: '东立面' }).click();
  await page.waitForTimeout(1000);
  await page
    .getByRole('button', { name: /切换到平面|平面/ })
    .last()
    .click();
  await page.waitForTimeout(2000);
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(4000);
  check((await viewButton().textContent())?.includes('透视'), '3D comes back in perspective');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
