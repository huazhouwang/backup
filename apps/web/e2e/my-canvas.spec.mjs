// E2E: the user's own canvas modules (issue 171): a module saved "for me" runs in the sample-room page of every design the user
// opens, keeps its data in their settings (not in any design), and is removed from any of them; another person doesn't get it
import { test } from '@playwright/test';
import { BASE, check } from './support.mjs';

test('my canvas modules', async ({ browser: b }) => {
  const errors = [];
  async function person() {
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
    // (also runs in the sandboxed page, which has no storage)
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('plinth.sandboxCanvas', '1');
      } catch {}
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => m.type() === 'error' && !/\b40[034]\b/.test(m.text()) && errors.push(m.text()));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /打开样例方案/ }).click();
    await page.waitForURL(/\/p\//);
    return page;
  }
  /** The sample-room page, once it has started */
  const frameOf = async page => {
    await page.waitForFunction(() => window.artifact?.ready);
    await page.locator('iframe[data-sandbox-canvas][data-ready]').waitFor({ timeout: 30000 });
    return (await page.locator('iframe[data-sandbox-canvas]').elementHandle()).contentFrame();
  };
  const call = (page, name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  const until = async (page, f, what) => {
    for (let i = 0; i < 60; i++) {
      if (await f()) return check(true, what);
      await page.waitForTimeout(200);
    }
    check(false, what);
  };
  const SOURCE = `export default function (canvas) {
    const g = canvas.layer();
    const draw = () => {
      g.replaceChildren();
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('data-mine', canvas.scope);
      t.textContent = String((canvas.data.get() ?? {}).count ?? 0);
      g.appendChild(t);
    };
    canvas.data.on(draw);
    draw();
    canvas.toolbar.appendChild(canvas.button('我的+1', () => canvas.data.set({ count: ((canvas.data.get() ?? {}).count ?? 0) + 1 })));
  }`;

  const a = await person();
  let frame = await frameOf(a);
  const saved = await call(a, 'canvas_my_module_put', { id: 'my-counter', name: '我的计数', source: SOURCE });
  check(
    saved.ok && saved.result.tried === true && saved.result.version === 1,
    `tried in the page, then saved as mine (${JSON.stringify(saved.result ?? saved.error)})`,
  );
  await until(a, async () => (await frame.locator('[data-mine="me"]').count()) === 1, 'it runs in the page, as my own');
  check(!(await a.evaluate(() => window.artifact.project())).canvas, 'and is not part of the design');

  await frame.getByRole('button', { name: '我的+1' }).click();
  await until(a, async () => (await frame.locator('[data-mine="me"]').textContent()) === '1', 'its data changes');
  const stored = () => a.evaluate(() => fetch('/api/me/canvas').then(r => r.json()));
  await until(a, async () => (await stored()).data?.['my-counter']?.count === 1, 'its data is kept in my settings');
  check(!(await a.evaluate(() => window.artifact.project())).canvas, 'not in the design');

  const bad = await call(a, 'canvas_my_module_put', { id: 'my-counter', name: '我的计数', source: 'export default () => { throw new Error("nope") }' });
  check(!bad.ok && /nope/.test(bad.error?.message ?? ''), `one that throws is refused (${bad.error?.message})`);
  check((await call(a, 'canvas_my_modules', {})).result?.[0]?.version === 1, 'and the saved one is kept');

  // Another design of mine runs it too, with the same data
  const blank = await a.evaluate(() =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '另一个方案', template: 'blank' }),
    }).then(r => r.json()),
  );
  await a.goto(`${BASE}/p/${blank.id}`);
  frame = await frameOf(a);
  await until(
    a,
    async () =>
      (await frame
        .locator('[data-mine="me"]')
        .textContent()
        .catch(() => '')) === '1',
    'it runs in another design of mine, with its data',
  );

  // Somebody else doesn't get it
  const other = await person();
  const otherFrame = await frameOf(other);
  await other.waitForTimeout(1000);
  check((await otherFrame.locator('[data-mine]').count()) === 0, 'another person does not get it');

  // Removed from any design, it goes
  const removed = await call(a, 'canvas_my_module_remove', { id: 'my-counter' });
  check(removed.ok, 'removed');
  await until(
    a,
    async () => (await frame.locator('[data-mine]').count()) === 0 && (await frame.getByRole('button', { name: '我的+1' }).count()) === 0,
    'what it added goes',
  );
  check((await a.evaluate(() => fetch('/api/me/canvas').then(r => r.json()))).modules.length === 0, 'and my settings no longer have it');
  await a.evaluate(id => fetch(`/api/projects/${id}`, { method: 'DELETE' }), blank.id);

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
