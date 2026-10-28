// E2E (issue 204): a widget library's page shows each widget at work on the sample house (tools over the plan, effects as a 3D
// still), and a widget can be copied into the user's own library (made when they have none) to change or install it anywhere.
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('widget library page: previews and remix', async ({ browser: b }) => {
  test.setTimeout(4 * 60_000);
  const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.goto(`${BASE}/widgets/builtin-widgets`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[data-widget-preview]').length >= 7, null, { timeout: 180_000 });
  check((await page.locator('svg [data-widget-preview="grid"]').count()) === 1, 'a tool is previewed over the plan');
  check((await page.locator('img[data-widget-preview="rain"]').count()) === 1, 'an effect as a still of the 3D view');
  await page.screenshot({ path: `${OUT}/widget-library-1.png`, fullPage: true });

  const card = page.locator('[data-widget-card="rain"]');
  await card.getByRole('button', { name: '复制到我的组件库' }).click();
  await page.getByText(/已存到“我的组件”/).waitFor();
  const libs = await page.evaluate(async () => (await fetch('/api/widget-libraries/files')).json());
  const own = libs.find(f => f.role === 'owner');
  check(!!own && !!own.library.widgets.rain, `copied into the user's own library (${own?.library.id})`);
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
