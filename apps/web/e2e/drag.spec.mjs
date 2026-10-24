// E2E: dragging in the plan → select a wall → drag it: the room's area follows live, release makes one edit, one undo restores it
// → drag a piece of furniture against a wall (snaps to the wall face) → drag a window along its wall
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('drag', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const call = (name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const iframe = await page.locator('iframe[title="画布"], iframe[title="Canvas"]').first().boundingBox();

  /** Select an object, then return the page coordinates of its drag handle's centre and the plan's millimetres per pixel */
  async function grab(id) {
    await call('view_focus', { ids: [id], highlight: false });
    await frame.waitForSelector('.plan-drag');
    await page.waitForTimeout(300);
    const r = await frame.evaluate(() => {
      const h = document.querySelector('.plan-drag'),
        box = h.getBoundingClientRect();
      const m = h.ownerSVGElement.getScreenCTM().inverse();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, mmPerPx: Math.hypot(m.a, m.b) };
    });
    return { x: iframe.x + r.x, y: iframe.y + r.y, mmPerPx: r.mmPerPx };
  }
  async function dragBy(from, dx, dy, steps = 12, hold) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(400);
    if (hold) await hold();
    await page.mouse.up();
    await page.waitForTimeout(400);
  }

  // Wall: 老人房一西墙, 500 mm west
  const room = (await call('find_objects', { query: '老人房一' })).result.find(o => o.type === 'space');
  const wall = (await call('get_object', { ref: room.id })).result.walls.find(w => w.direction === '西' || w.direction === 'west');
  const area0 = (await call('get_object', { ref: room.id })).result.netArea;
  const log0 = (await call('history_log', {})).result.length;
  const w = await grab(wall.id);
  let liveLabel = null;
  await dragBy(w, -500 / w.mmPerPx, 0, 12, async () => {
    liveLabel = await frame.evaluate(
      name => [...document.querySelectorAll('text')].find(t => t.textContent === name)?.nextElementSibling?.textContent ?? null,
      room.name,
    );
    await page.screenshot({ path: `${OUT}/drag-wall.png` });
  });
  const area1 = (await call('get_object', { ref: room.id })).result.netArea;
  check(
    liveLabel && !liveLabel.startsWith(area0.toFixed(1)),
    `while dragging, the room label shows the new area live (${liveLabel}, was ${area0.toFixed(1)} m²)`,
  );
  check(Math.abs(area1 - area0) > 1, `dragging the wall 0.5 m west changes the room's area (${area0} → ${area1} m²)`);
  check((await call('history_log', {})).result.length === log0 + 1, 'the drag is one edit in the history');
  await call('history_undo', {});
  const area2 = (await call('get_object', { ref: room.id })).result.netArea;
  check(Math.abs(area2 - area0) < 0.01, `one undo restores the area (${area2} m²)`);

  // Furniture: pushed toward a wall it snaps to the wall face
  const bed = (await call('find_objects', { query: '床' })).result.find(o => o.type === 'furniture' && o.level === 'L1');
  const f0 = (await call('get_object', { ref: bed.id })).result;
  const g = await grab(bed.id);
  await dragBy(g, 333 / g.mmPerPx, 177 / g.mmPerPx);
  const f1 = (await call('get_object', { ref: bed.id })).result;
  check(f1.position[0] !== f0.position[0] || f1.position[1] !== f0.position[1], `furniture moves (${f0.position} → ${f1.position})`);
  await call('history_undo', {});

  // Window: along its wall
  const host = (await call('get_object', { ref: room.id })).result.walls.find(x => x.openings.length > 0);
  const opening = (await call('get_object', { ref: host.id })).result.openings[0];
  const o0 = (await call('get_object', { ref: opening.id })).result;
  const h = await grab(opening.id);
  await dragBy(h, 300 / h.mmPerPx, 300 / h.mmPerPx);
  const o1 = (await call('get_object', { ref: opening.id })).result;
  check(o1.at !== o0.at, `the opening slides along its wall (${o0.at} → ${o1.at})`);
  await call('history_undo', {});

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
