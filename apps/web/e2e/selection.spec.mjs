// E2E: selection (#149) → in the plan the mouse over a wall outlines it thinly in the selection blue and a tooltip names it
// → a click selects it, stippled with blue dots as in SketchUp → in 3D the mouse over a door or window names it, and a click selects the
// door or window itself, not its wall
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('selection', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const iframe = await page.locator('iframe').first().boundingBox();
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
  const tip = () =>
    frame
      .locator('[data-hover-tip]')
      .textContent({ timeout: 2000 })
      .catch(() => null);
  const selection = async () => (await page.evaluate(async () => (await window.artifact.call('view_get', {})).result.selection)).map(s => s.id ?? s);

  // The west outer wall: pre-highlighted and named
  await page.mouse.move(...(await at(2120, 3000)));
  await page.waitForTimeout(900);
  const hovered = await frame.evaluate(() => {
    const el = [...document.querySelectorAll('.plan-hit')].find(e => e.matches(':hover'));
    const blue = getComputedStyle(document.documentElement).getPropertyValue('--canvas-selection').trim();
    return el && { stroke: getComputedStyle(el).stroke, blue, fill: getComputedStyle(el).fill };
  });
  check(!!hovered && hovered.stroke !== 'none' && hovered.stroke !== hovered.fill, `the wall under the mouse is outlined (${JSON.stringify(hovered)})`);
  check((await tip()) === '承重墙 : 西外墙', `a tooltip names it (${await tip()})`);
  await page.screenshot({ path: `${OUT}/selection-hover.png` });

  // A click selects it: semi-transparent selection blue
  await page.mouse.click(...(await at(2120, 3000)));
  await page.waitForTimeout(500);
  const sel = await frame.evaluate(() => {
    const p = document.querySelector('[data-selected]');
    return p && { fill: p.getAttribute('fill'), opacity: p.getAttribute('fill-opacity') };
  });
  check(sel?.fill === 'url(#selection-dots)', `selected, it is stippled with blue dots (${JSON.stringify(sel)})`);

  // 3D: find a window under the mouse by its tooltip, then click it
  await page.mouse.click(iframe.x + 10, iframe.y + iframe.height - 10);
  await page.getByRole('button', { name: '切换到三维' }).click();
  await page.waitForTimeout(7000);
  // A door or window, and a floor (a large surface, to see its stipple go when something else is selected)
  let found = null,
    floor = null;
  for (let y = 0.2; y < 0.8 && !(found && floor); y += 0.03)
    for (let x = 0.15; x < 0.85 && !(found && floor); x += 0.03) {
      const q = [iframe.x + iframe.width * x, iframe.y + iframe.height * y];
      await page.mouse.move(...q);
      await page.waitForTimeout(40);
      const id = await frame.evaluate(() => document.querySelector('[data-hover-id]')?.getAttribute('data-hover-id'));
      if (id && /-o\d+$/.test(id) && !found) found = { q, id };
      if (id && /-s\d+$/.test(id) && !floor) floor = { q, id };
    }
  if (found) {
    await page.waitForTimeout(800);
    found.tip = await tip();
  }
  check(!!found && /窗|门/.test(found.tip ?? ''), `in 3D the mouse over a door or window names it (${found?.id}: ${found?.tip})`);
  // Selecting something else clears the stipple of what was selected (it used to stay on walls, floors and roofs)
  const away = [iframe.x + 6, iframe.y + 6];
  const bluePixels = async () => {
    await page.mouse.move(...away);
    await page.waitForTimeout(600);
    const png = await page.screenshot({ clip: iframe });
    return page.evaluate(async b64 => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 60 && d[i + 2] > d[i + 1] + 30) n++;
      return n;
    }, png.toString('base64'));
  };
  if (found && floor) {
    const none = await bluePixels();
    // Under load the 3D view can lag: wait for each click to select before counting
    const selected = async id => {
      for (let i = 0; i < 40 && JSON.stringify(await selection()) !== JSON.stringify([id]); i++) await page.waitForTimeout(150);
    };
    await page.mouse.click(...floor.q);
    await selected(floor.id);
    const onFloor = (await bluePixels()) - none;
    await page.mouse.click(...found.q);
    await selected(found.id);
    const afterwards = (await bluePixels()) - none;
    check(onFloor > 500 && afterwards < onFloor / 3, `selecting a window clears the floor's stipple (${onFloor} blue pixels, then ${afterwards})`);
  } else check(false, `found a floor to select in 3D (${floor?.id})`);
  if (found) {
    await page.mouse.click(...found.q);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/selection-3d.png` });
    check(
      JSON.stringify(await selection()) === JSON.stringify([found.id]),
      `a click in 3D selects the door or window itself, not its wall (${await selection()})`,
    );
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
