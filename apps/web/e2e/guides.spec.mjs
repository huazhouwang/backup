// E2E: guides → with the tape, dragging off the living room's north wall face draws a parallel guide at the offset, typed exact
// afterwards → furniture dragged near it snaps onto it → a click selects it and Delete removes it → clearing removes them all;
// on a phone one finger draws a guide off a wall
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

const open = async page => {
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
  return { frame, at };
};
const guides = page => page.evaluate(async () => (await window.artifact.call('find_objects', { type: 'guide' })).result);

test('guides', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { frame, at } = await open(page);
  await page.getByRole('button', { name: '卷尺' }).click();
  // The living room's north wall inner face is at y = 210: drag from it down to y ≈ 3810
  const from = await at(7000, 212);
  const to = await at(7000, 3812);
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 12 });
  const shown = await frame.evaluate(() => document.querySelector('[data-guide-draft]')?.textContent);
  await page.screenshot({ path: `${OUT}/guides-draft.png` });
  await page.mouse.up();
  await page.waitForTimeout(500);
  check(Math.abs(Number(shown) - 3600) <= 20, `dragging off the wall shows the offset live (${shown})`);
  const [g] = await guides(page);
  const line = (await page.evaluate(async id => (await window.artifact.call('get_object', { ref: id })).result, g?.id)) ?? {};
  check(!!g && Math.abs(line.at?.[1] - 3810) <= 20 && line.dir?.[0] === 1, `a parallel guide is drawn (${JSON.stringify(line.at)})`);
  // Type the offset exactly
  const offset = page.getByRole('textbox', { name: '参考线偏移' });
  await offset.fill('3000');
  await offset.press('Enter');
  await page.waitForTimeout(400);
  const moved = await page.evaluate(async id => (await window.artifact.call('get_object', { ref: id })).result, g.id);
  check(moved.at[1] === 3210, `typing the offset moves it exactly (${moved.at[1]})`);
  await page.screenshot({ path: `${OUT}/guides-plan.png` });

  // Snapping: a measurement ending near the guide lands on it
  await page.mouse.click(...(await at(4000, 230)));
  await page.mouse.click(...(await at(4000, 3230)));
  await page.waitForTimeout(300);
  const texts = await frame.evaluate(() => [...document.querySelectorAll('[data-feedback] text')].map(t => t.textContent));
  check(texts.includes('3000'), `the tape snaps onto the guide (${texts.filter(t => /^\d+$/.test(t)).join(', ')})`);

  // Select it and delete it
  await page.getByRole('button', { name: '完成' }).click();
  await page.waitForTimeout(300);
  await page.mouse.click(...(await at(9000, 3210)));
  await page.waitForTimeout(300);
  const selected = await page.evaluate(async () => (await window.artifact.call('view_get', {})).result.selection.map(s => s.id ?? s));
  check(selected.includes(g.id), 'a click selects the guide');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  check((await guides(page)).length === 0, 'Delete removes it');

  // Clear them all
  await page.evaluate(async () => {
    await window.artifact.call('guide_add', { at: [0, 1000] });
    await window.artifact.call('guide_add', { at: [1000, 0], direction: 'y' });
  });
  await page.getByRole('button', { name: '卷尺' }).click();
  await page.getByRole('button', { name: '清除全部参考线' }).click();
  await page.waitForTimeout(400);
  check((await guides(page)).length === 0, 'clearing removes all the guides');

  // 3D: hovering an edge says so; dragging off it draws a guide across the face
  await page.getByRole('button', { name: '完成' }).click();
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(8000);
  await page.getByRole('button', { name: '卷尺' }).click();
  const box = await page.locator('iframe').first().boundingBox();
  let edge = null;
  for (let y = 0.25; y < 0.8 && !edge; y += 0.02)
    for (let x = 0.3; x < 0.7 && !edge; x += 0.04) {
      const q = [box.x + box.width * x, box.y + box.height * y];
      await page.mouse.move(...q);
      if (await frame.locator('[data-on-edge]').count()) edge = q;
    }
  check(!!edge, 'hovering an edge with the tape says a guide can be dragged off it');
  if (edge) {
    await page.mouse.down();
    await page.mouse.move(edge[0] + 10, edge[1] - 60, { steps: 10 });
    const live = await frame.locator('[data-guide-draft]').count();
    await page.screenshot({ path: `${OUT}/guides-3d.png` });
    await page.mouse.up();
    await page.waitForTimeout(500);
    check(live > 0 && (await guides(page)).length === 1, 'dragging off it draws a guide in 3D');
  }
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});

test('guides on a phone', async ({ browser: b }) => {
  test.setTimeout(180_000);
  const context = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const { at } = await open(page);
  await page.getByRole('button', { name: '卷尺' }).tap();
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const from = await at(7000, 212);
  const to = await at(7000, 3812);
  await touch('touchStart', ...from);
  for (let i = 1; i <= 12; i++) await touch('touchMove', from[0] + ((to[0] - from[0]) * i) / 12, from[1] + ((to[1] - from[1]) * i) / 12);
  await touch('touchEnd');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/guides-phone.png` });
  check((await guides(page)).length >= 1, 'one finger draws a guide off a wall');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
