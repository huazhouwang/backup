// E2E: the user's own widgets (#163): a widget added "for me" draws in every design the user opens, without going into any
// design; it is changed and removed from any of them; nobody else sees it
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('my widgets', async ({ browser: b }) => {
  const errors = [];
  /** A guest with the sample design open */
  async function person() {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && !/\b40[034]\b/.test(m.text()) && errors.push(m.text()));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    await page.waitForFunction(() => window.artifact?.ready);
    return { page, url: page.url() };
  }
  const project = page => page.evaluate(() => window.artifact.project());
  const openPanel = async page => {
    await page.getByRole('button', { name: '更多' }).click();
    await page.getByRole('menuitem', { name: '小组件' }).click();
    await page.locator('[data-widgets-panel]').waitFor();
  };
  const drawn = (page, id) =>
    page.evaluate(
      w => [...document.querySelectorAll('iframe')].flatMap(f => [...(f.contentDocument?.querySelectorAll(`[data-widget="${w}"]`) ?? [])]).length,
      id,
    );
  const until = async (page, f, what) => {
    for (let i = 0; i < 60; i++) {
      if (await f()) return check(true, what);
      await page.waitForTimeout(250);
    }
    check(false, what);
  };

  const a = await person();
  await openPanel(a.page);
  await a.page.getByRole('button', { name: '坐标系：添加到我的所有方案' }).click();
  await until(a.page, async () => (await drawn(a.page, 'me-1')) > 0, 'a coordinate system added for me draws on the canvas');
  check((await project(a.page)).widgets.length === 0, 'it is not part of the design');
  check((await a.page.locator('[data-my-widgets]').innerText()).includes('坐标系'), 'the panel lists it under my widgets');
  await a.page.screenshot({ path: `${OUT}/my-widgets-1.png` });

  const set = await a.page.evaluate(() => fetch('/api/me/widgets').then(r => r.json()));
  check(set.widgets.length === 1 && set.widgets[0].widget.id === 'axes', 'kept in my settings');

  // Another design of mine draws it too
  const blank = await a.page.evaluate(() =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '另一个方案', template: 'blank' }),
    }).then(r => r.json()),
  );
  await a.page.goto(`${BASE}/p/${blank.id}`);
  await a.page.waitForFunction(() => window.artifact?.ready);
  await until(a.page, async () => (await drawn(a.page, 'me-1')) > 0, 'it draws in another design of mine');
  check((await project(a.page)).widgets.length === 0, 'and is not part of that one either');

  // Hidden there, it is hidden everywhere; removing it removes it everywhere
  await openPanel(a.page);
  await a.page.locator('[data-my-widgets]').getByRole('button', { name: '显示 坐标系' }).click();
  await until(a.page, async () => (await drawn(a.page, 'me-1')) === 0, 'hiding it hides it');
  await a.page.locator('[data-my-widgets]').getByRole('button', { name: '显示 坐标系' }).click();
  await until(a.page, async () => (await drawn(a.page, 'me-1')) > 0, 'showing it again');

  // Nobody else sees it
  const bob = await person();
  await bob.page.waitForTimeout(2000);
  check((await drawn(bob.page, 'me-1')) === 0, 'someone else does not see it');

  await a.page.locator('[data-my-widgets]').getByRole('button', { name: '移除 坐标系' }).click();
  await until(a.page, async () => (await drawn(a.page, 'me-1')) === 0, 'removing it clears it');
  await a.page.goto(a.url);
  await a.page.waitForFunction(() => window.artifact?.ready);
  await a.page.waitForTimeout(2000);
  check((await drawn(a.page, 'me-1')) === 0, 'and it is gone from my other design');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
