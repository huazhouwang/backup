// E2E: section planes → a section line drawn in the plan cuts the 3D model and the model still orbits → the section bar flips it and
// clears it → going back to the plan from 3D shows it at its final framing from the first frame → 3D shows vertical dimensions
// on each façade that stay put as the view turns, which the dimensions layer hides
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
  // The datums are placed frame by frame: wait for them to settle (software GL draws a few frames a second)
  const datumsAfterward = async (ok = n => n >= 4) => {
    let n = await datums();
    for (let i = 0; i < 20 && !ok(n); i++) {
      await page.waitForTimeout(500);
      n = await datums();
    }
    return n;
  };
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
  check((await datumsAfterward()) >= 4, 'and stays cut');
  const before = await canvas.screenshot();
  await page.getByRole('button', { name: '反方向看' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/views-section-flip.png` });
  check(!before.equals(await canvas.screenshot()) && (await datumsAfterward()) >= 4, 'the section bar flips the section');
  await page.getByRole('button', { name: '取消剖切' }).click();
  await page.waitForTimeout(800);
  check((await datumsAfterward(n => n === 0)) === 0 && !(await page.getByText('剖切中').count()), 'the section bar clears the section');
  check(!(await page.getByRole('button', { name: '相机' }).count()), 'there is no camera menu');

  // Back to the plan: it appears at its final framing, not at some other scale for a frame first
  await frame.evaluate(() => {
    window.viewBoxes = [];
    const seen = () => {
      const svg = document.querySelector('svg[role="img"]');
      const vb = svg?.getAttribute('viewBox');
      if (vb && window.viewBoxes.at(-1) !== vb) window.viewBoxes.push(vb);
    };
    new MutationObserver(seen).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['viewBox'] });
  });
  // The section left the view in 3D
  check(!(await frame.locator('svg[role="img"]').count()), 'the plan is gone in 3D');
  await page.getByRole('button', { name: '切换到平面' }).click({ timeout: 5000 });
  await page.waitForTimeout(5000);
  const boxes = await frame.evaluate(() => window.viewBoxes);
  check(boxes.length === 1, `leaving 3D, the plan shows at one framing (${boxes.join(' | ')})`);

  // 3D: vertical dimensions beside the house, the storeys and the floor levels' elevations; the dimensions layer hides them
  await page.getByRole('button', { name: '切换到三维' }).click();
  for (let i = 0; i < 30 && (await frame.locator('[data-elevation]').count()) < 5; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1000);
  const heights = await frame.evaluate(() => [...document.querySelectorAll('[data-height-dim]')].map(e => Number(e.dataset.heightDim)));
  const levels = await frame.evaluate(() => [...document.querySelectorAll('[data-elevation]')].map(e => e.dataset.elevation));
  check(
    [3600, 3300, 2800, 13200].every(v => heights.includes(v)) && ['±0.000', '3.600', '6.900', '10.200', '-0.200'].every(v => levels.includes(v)),
    `3D stands vertical dimensions beside the house (${heights.join(' ')} | ${levels.join(' ')})`,
  );
  await page.screenshot({ path: `${OUT}/views-height-dims.png` });
  // One on each façade, and they stay put as the view turns
  const sheet = () =>
    frame.evaluate(() =>
      [...document.querySelectorAll('[data-height-sheet]')].map(e => `${e.getAttribute('data-height-sheet')}@${e.getAttribute('data-at')}`).join(' '),
    );
  const standing = await sheet();
  await drag(300, 0);
  await drag(300, 0);
  check(standing.split(' ').length === 4 && (await sheet()) === standing, `turning the view leaves them where they stand (${standing} → ${await sheet()})`);
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitem', { name: '隐藏尺寸' }).click();
  await page.waitForTimeout(800);
  check((await frame.locator('[data-height-dim]').count()) === 0, 'hiding the dimensions hides them in 3D too');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
