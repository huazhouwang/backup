// E2E: walking through → the view menu's walk mode stands at eye height in a room → W walks forward → Esc returns to the orbit view
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('walk', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  await page
    .getByRole('button', { name: /三维/ })
    .first()
    .click();
  await page.waitForTimeout(5000);
  const viewButton = () => page.getByRole('button', { name: '视图' });
  await viewButton().click();
  await page.getByRole('menuitemradio', { name: '漫游' }).click();
  await page.waitForTimeout(1500);
  check((await viewButton().textContent())?.includes('漫游'), 'the view menu enters walk mode');
  const canvas = page.locator('iframe').first();
  const before = await canvas.screenshot();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  const after = await canvas.screenshot();
  await page.screenshot({ path: `${OUT}/walk.png` });
  check(!before.equals(after), 'W walks forward (the view changes)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  check((await viewButton().textContent())?.includes('透视'), 'Esc returns to the orbit view');
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
