// E2E: the sample room on a phone (issue 171). It is switched on from the ⋯ menu (which then closes), its toolbar sits above the
// tab bar, a module's actions on the selection stand in for the keys and double-clicks a phone lacks, and two fingers zoom.
import { test, devices } from '@playwright/test';
import { BASE, check } from './support.mjs';
import { GRID_MODULE } from './grid-module.mjs';

test('sample room on a phone', async ({ browser: b }) => {
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const project = () => page.evaluate(() => window.artifact.project());
  const until = async (f, what) => {
    for (let i = 0; i < 40; i++) {
      if (await f()) return check(true, what);
      await page.waitForTimeout(150);
    }
    check(false, what);
  };

  await page.getByRole('button', { name: '更多' }).click();
  await page.getByRole('menuitemcheckbox', { name: /样板间/ }).click();
  await page.locator('iframe[data-sandbox-canvas][data-ready]').waitFor({ timeout: 30000 });
  check((await page.getByRole('menuitemcheckbox', { name: /样板间/ }).count()) === 0, 'the menu closes once it is switched on');
  const frame = await (await page.locator('iframe[data-sandbox-canvas]').elementHandle()).contentFrame();

  // Its toolbar is in reach, above the tab bar
  const bar = await frame.locator('[role=toolbar]').boundingBox();
  const tabs = await page.getByRole('button', { name: '对话' }).boundingBox();
  check(bar.y + bar.height <= tabs.y, `the toolbar sits above the tab bar (${Math.round(bar.y + bar.height)} ≤ ${Math.round(tabs.y)})`);

  // A selected axis gets actions instead of double-click and Delete
  await page.evaluate(s => window.artifact.call('canvas_module_put', { id: 'structural-grid', name: '结构轴网', source: s }), GRID_MODULE);
  await frame.locator('[data-axis="x1"]').waitFor({ state: 'attached' });
  const hit = await frame.locator('[data-axis="x1"]').boundingBox();
  await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height * 0.08);
  await until(async () => (await frame.locator('[data-actions] button').count()) === 2, 'a tapped axis offers its actions');
  await frame.locator('[data-actions]').getByRole('button', { name: '改名' }).tap();
  const input = frame.locator('[data-axis-rename="x1"]');
  await input.waitFor();
  await input.fill('2a');
  await input.press('Enter');
  const axis = id => project().then(p => p.canvas?.data?.['structural-grid']?.[p.levels[0].id]?.axes.find(a => a.id === id));
  await until(async () => (await axis('x1'))?.name === '2a', 'renamed through its action');
  await page.touchscreen.tap(hit.x + hit.width / 2, hit.y + hit.height * 0.08);
  await frame.locator('[data-actions]').getByRole('button', { name: '删除轴线' }).tap();
  await until(async () => (await axis('x1')) === undefined && (await axis('x0')) !== undefined, 'deleted through its action');

  // Two fingers zoom in
  const zoom = () => frame.evaluate(() => document.querySelector('svg.plinth-plan').viewBox.baseVal.width);
  const before = await zoom();
  await frame.evaluate(() => {
    const svg = document.querySelector('svg.plinth-plan');
    const r = svg.getBoundingClientRect();
    const cx = r.x + r.width / 2,
      cy = r.y + r.height / 2;
    const fire = (type, id, x) =>
      svg.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: cy, bubbles: true }));
    fire('pointerdown', 1, cx - 20);
    fire('pointerdown', 2, cx + 20);
    for (let i = 1; i <= 5; i++) {
      fire('pointermove', 1, cx - 20 - i * 12);
      fire('pointermove', 2, cx + 20 + i * 12);
    }
    fire('pointerup', 1, cx - 80);
    fire('pointerup', 2, cx + 80);
  });
  const after = await zoom();
  check(after < before / 2, `two fingers zoom in (${Math.round(before)} → ${Math.round(after)} mm across)`);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
