// E2E: widgets → ⋯ opens the widgets panel → add a grid: its axes, labels and origin handle in the plan → its settings change
// the spacing → dragging its handle moves the origin → an armchair placed near an intersection snaps onto it → 3D draws it too,
// and its handle drags there
// → hiding hides it → a reload keeps it → removing it clears it; each change one edit through the capability registry
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('widgets', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  let frame = page.frames().find(f => f !== page.mainFrame());
  const call = (name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  const grid = async () => (await call('find_objects', { type: 'widget' })).result[0];
  const lines = () => frame.locator('[data-widget-item="line"]').count();
  const until = async (f, ms = 15000) => {
    for (let t = 0; t < ms && !(await f()); t += 250) await page.waitForTimeout(250);
  };

  // ⋯ → 小组件 → add the grid
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitem', { name: '小组件' }).click();
  check(await page.locator('[data-widgets-panel]').isVisible(), '⋯ opens the widgets panel');
  await page.getByRole('button', { name: '添加 轴网' }).click();
  await until(async () => (await lines()) > 0);
  const id = (await grid())?.id;
  const n0 = await lines();
  check(
    !!id && n0 > 0 && (await frame.locator('[data-widget-item="label"]').count()) > 0 && (await frame.locator('[data-widget-handle]').count()) === 1,
    `adding a grid draws its axes, labels and origin handle (${n0} lines)`,
  );
  await page.screenshot({ path: `${OUT}/widgets-grid.png` });

  // Its settings: a wider spacing draws fewer axes
  await page.getByRole('button', { name: '轴网 的设置' }).click();
  const spacing = page.locator('[data-param="spacing"] input');
  await spacing.fill('6000');
  await spacing.press('Enter');
  const wide = async () => (await call('get_object', { ref: id })).result.params.spacing === 6000 && (await lines()) < n0;
  await until(wide);
  check(await wide(), `a wider spacing draws fewer axes (${(await call('get_object', { ref: id })).result.params.spacing}, ${await lines()} lines)`);
  await page.getByRole('button', { name: '关闭小组件面板' }).click();

  // Dragging the origin handle moves the origin (50 mm steps)
  const handle = await frame.locator('[data-widget-handle]').boundingBox();
  const [hx, hy] = [handle.x + handle.width / 2, handle.y + handle.height / 2];
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 90, hy + 70, { steps: 8 });
  await page.mouse.up();
  await until(async () => (await call('get_object', { ref: id })).result.params.originX != null);
  const { originX, originY } = (await call('get_object', { ref: id })).result.params;
  check(typeof originX === 'number' && originX % 50 === 0 && originY % 50 === 0, `dragging the handle moves the origin (${originX}, ${originY})`);

  // An armchair placed near the origin (an intersection) snaps onto it
  const before = (await call('find_objects', { type: 'furniture', limit: 200 })).result.map(f => f.id);
  await page.getByRole('button', { name: '添加门窗或家具' }).click();
  await page.getByRole('option', { name: '单人椅', exact: true }).click();
  const moved = await frame.locator('[data-widget-handle]').boundingBox();
  await page.mouse.move(moved.x + moved.width / 2 + 4, moved.y + moved.height / 2 - 3);
  await page.waitForTimeout(200);
  await page.mouse.click(moved.x + moved.width / 2 + 4, moved.y + moved.height / 2 - 3);
  await page.waitForTimeout(500);
  const chair = (await call('find_objects', { type: 'furniture', limit: 200 })).result.find(f => !before.includes(f.id));
  const pos = chair && (await call('get_object', { ref: chair.id })).result.position;
  check(pos?.[0] === originX && pos?.[1] === originY, `an armchair placed near an intersection snaps onto it (${pos})`);

  // 3D draws it too, and nothing breaks
  await page.getByRole('button', { name: '切换到三维' }).click();
  await until(async () => (await frame.locator('[data-widget-item="label"]').count()) > 0);
  check((await frame.locator('[data-widget-item="label"]').count()) > 0, '3D draws the grid on the floor, with its labels');
  await page.screenshot({ path: `${OUT}/widgets-3d.png` });
  // Its handle drags across the floor in 3D, without orbiting the view
  await page.waitForTimeout(1500);
  const h3 = await frame.locator('[data-widget-handle-3d]').boundingBox();
  await page.mouse.move(h3.x, h3.y);
  await page.mouse.down();
  await page.mouse.move(h3.x + 60, h3.y, { steps: 8 });
  await page.mouse.up();
  await until(async () => (await call('get_object', { ref: id })).result.params.originX !== originX);
  const after3d = (await call('get_object', { ref: id })).result.params;
  check(
    after3d.originX !== originX && after3d.originX % 50 === 0,
    `dragging the handle in 3D moves the origin (${originX} → ${after3d.originX}, ${after3d.originY})`,
  );
  await page.getByRole('button', { name: '切换到平面' }).click();
  await until(async () => (await lines()) > 0);

  // Hidden, it draws nothing
  await call('widget_configure', { widget: id, visible: false });
  await until(async () => (await lines()) === 0);
  check((await lines()) === 0, 'hiding the grid hides it');
  await call('widget_configure', { widget: id, visible: true });
  await until(async () => (await lines()) > 0);

  // A reload keeps it
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.artifact?.ready);
  frame = page.frames().find(f => f !== page.mainFrame());
  await until(async () => (await lines()) > 0);
  check((await grid())?.id === id && (await lines()) > 0, 'a reload keeps the grid');

  // Removing it from the panel clears it
  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitem', { name: '小组件' }).click();
  await page.getByRole('button', { name: '移除 轴网' }).click();
  await until(async () => (await lines()) === 0);
  check(!(await grid()) && (await lines()) === 0, 'removing the grid clears it');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
