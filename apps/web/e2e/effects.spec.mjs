// E2E (issue 203): effects are widgets that move in 3D. Rain installed over the courtyard shows in 3D (the sky turns overcast)
// and on the plan (where it falls); making it heavier and moving it are parameter changes; an effect over budget is refused;
// night darkens the sky; with reduced motion nothing breaks.
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('effects in 3D', async ({ browser: b }) => {
  test.setTimeout(4 * 60_000);
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.goto(page.url().split('?')[0] + '?mode=3d');
  await page.waitForFunction(() => window.artifact?.ready);
  const call = (name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  // The colour of the sky, top left of the 3D view
  const canvas = page.locator('[aria-label="画布"]').first();
  const sky = async () => {
    const box = await canvas.boundingBox();
    const png = await page.screenshot({ clip: { x: box.x + 40, y: box.y + 120, width: 4, height: 4 } });
    return png.toString('base64');
  };
  await page.waitForTimeout(3000);
  const clear = await sky();

  const r = await call('widget_install', { library: 'builtin-widgets', widget: 'rain', params: { space: '庭院', intensity: 0.5 } });
  check(r.ok, 'rain installed over the courtyard');
  const id = r.result.id;
  let overcast = clear;
  for (let i = 0; i < 20 && overcast === clear; i++) {
    await page.waitForTimeout(1000);
    overcast = await sky();
  }
  check(overcast !== clear, 'the 3D view changes: rain falls under an overcast sky');
  await page.screenshot({ path: `${OUT}/effects-1-rain.png` });

  const heavier = await call('widget_configure', { widget: id, params: { intensity: 1, wind: 4 } });
  check(heavier.ok, 'heavier, with wind: a parameter change');
  const moved = await call('widget_configure', { widget: id, params: { space: '' } });
  check(moved.ok, 'over the whole site: a parameter change');
  check((await page.evaluate(() => window.artifact.project().widgets[0].params)).space === '', 'the design keeps the new parameters');
  const undo = await call('history_undo', {});
  check(undo.ok && (await page.evaluate(() => window.artifact.project().widgets[0].params)).space === '庭院', 'each change is undoable');

  // On the plan, a dashed outline shows where it rains
  await call('view_set', { mode: '2d' });
  // The canvas draws in its own same-origin frame
  await page.waitForFunction(
    () => [...document.querySelectorAll('iframe')].some(f => f.contentDocument?.querySelector('[data-widget-item="particles"]')),
    null,
    { timeout: 20000 },
  );
  check(true, 'the plan shows where the rain falls');

  // Over budget: refused with the reason, so the agent can fix it
  const big = await call('widget_create', {
    name: '暴雨',
    description: 'test',
    script:
      "function widget(p) { return [{ type: 'particles', outline: [[0,0],[1000,0],[1000,1000]], from: 0, to: 3000, count: 50000, fall: 9, size: 300, shape: 'streak', tone: 'water' }]; }",
  });
  check(!big.ok && /count|20000/.test(big.error.message), `an effect over budget is refused (${big.error?.message?.slice(0, 80)})`);
  const red = await call('widget_create', {
    name: '红雨',
    description: 'test',
    script:
      "function widget(p) { return [{ type: 'particles', outline: [[0,0],[1000,0],[1000,1000]], from: 0, to: 3000, count: 10, fall: 9, size: 300, shape: 'streak', tone: 'water', color: '#ff0000' }]; }",
  });
  check(!red.ok, 'a widget cannot choose colours, only tones');

  // Night
  await call('view_set', { mode: '3d' });
  await call('widget_remove', { widget: id });
  check((await call('widget_install', { library: 'builtin-widgets', widget: 'night', params: {} })).ok, 'night installed');
  let dark = clear;
  for (let i = 0; i < 20 && (dark === clear || dark === overcast); i++) {
    await page.waitForTimeout(1000);
    dark = await sky();
  }
  check(dark !== clear && dark !== overcast, 'the sky turns to night');
  await page.screenshot({ path: `${OUT}/effects-2-night.png` });
  check(errors.length === 0, `no page errors (reduced motion) ${errors.slice(0, 3).join(' | ')}`);
});
