// E2E: widget libraries (#163): create one from the top navigation, save a widget the design has of its own into it, share it,
// a teammate installs a widget from it (copied into their design), a new version is offered with what changed and applied only
// when asked, export and import as a file, deleting the library leaves the teammate's design drawing
import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('widget libraries', async ({ browser: b }) => {
  const errors = [];
  const SCRIPT = `function widget(project, params, ctx) {
  const out = [];
  for (const s of project.spaces) {
    if (s.level !== ctx.level || s.kind === 'void' || !s.shape.length) continue;
    const ring = s.shape[0].outer;
    out.push({ type: 'point', at: [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length] });
  }
  return out;
}`;
  const DEF = { name: { zh: '房间中心' }, version: '1.0.0', description: 'Marks the centre of every room.', permissions: ['draw'], script: SCRIPT };

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
    const email = await page.evaluate(async () => (await (await fetch('/api/me')).json()).user.email);
    return { page, email, url: page.url() };
  }
  const project = page => page.evaluate(() => window.artifact.project());
  const call = (page, name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  const openPanel = async page => {
    await page.getByRole('button', { name: '更多' }).click();
    await page.getByRole('menuitem', { name: '小组件' }).click();
    await page.locator('[data-widgets-panel]').waitFor();
  };
  const points = (page, id) =>
    page.evaluate(
      w =>
        [...document.querySelectorAll('iframe')].flatMap(f => [
          ...(f.contentDocument?.querySelectorAll(`[data-widget="${w}"][data-widget-item="point"]`) ?? []),
        ]).length,
      id,
    );
  const until = async (page, f, what) => {
    for (let i = 0; i < 60; i++) {
      if (await f()) return check(true, what);
      await page.waitForTimeout(250);
    }
    check(false, what);
  };

  const a = await person(),
    bob = await person();

  // The top navigation opens the widget libraries: the built-in one; A creates one there
  await a.page.goto(`${BASE}/projects`);
  await a.page.locator('header a[href="/widgets"]').click();
  await a.page.waitForURL(/\/widgets$/);
  await a.page.getByRole('link', { name: '打开“基础组件”' }).waitFor({ timeout: 15000 });
  check(true, 'the widget library list shows the built-in library');
  await a.page.getByLabel('新组件库的名字').fill('团队组件');
  await a.page.getByRole('button', { name: '新建组件库' }).click();
  await a.page.waitForURL(/\/widgets\/wlib/);
  const libId = a.page.url().split('/').pop();
  await a.page.getByText('还没有小组件', { exact: false }).waitFor();
  check(true, 'a new widget library opens on its own page, empty');

  // A has a widget of the design's own (as the agent makes them) and saves it into the library from the panel
  await a.page.goto(a.url);
  await a.page.waitForFunction(() => window.artifact?.ready);
  const made = await call(a.page, 'widget_create', { id: 'centres', name: '房间中心', description: DEF.description, script: SCRIPT });
  check(made.ok, `the design has its own widget: ${JSON.stringify(made.error ?? made.result)}`);
  await openPanel(a.page);
  await a.page.getByRole('button', { name: '把房间中心存到组件库' }).click();
  await a.page.getByRole('button', { name: '存入' }).click();
  await a.page.getByText('已存到“团队组件”，版本 v1.0.0').waitFor({ timeout: 15000 });
  check(true, 'saved into the library at v1.0.0');

  // The library page shows it; A shares the library with Bob
  await a.page.goto(`${BASE}/widgets/${libId}`);
  await a.page.locator('[data-widget-card="centres"]').waitFor({ timeout: 15000 });
  check((await a.page.locator('[data-widget-card="centres"]').innerText()).includes('v1.0.0'), 'the library page shows the widget with its version');
  await a.page.screenshot({ path: `${OUT}/widget-libraries-1-page.png` });
  await a.page.getByRole('button', { name: '管理' }).click();
  await a.page.getByLabel('对方注册用的邮箱').fill(bob.email);
  await a.page.getByRole('button', { name: '分享' }).click();
  await a.page.getByText(bob.email).waitFor({ timeout: 15000 });
  check(true, 'shared with a teammate');
  await a.page.keyboard.press('Escape');

  // Bob installs it from the panel, where it shows which library it comes from; the design keeps a copy
  await bob.page.reload();
  await bob.page.waitForFunction(() => window.artifact?.ready);
  await openPanel(bob.page);
  const add = bob.page.getByRole('button', { name: '添加 房间中心' });
  await add.waitFor({ timeout: 15000 });
  check(
    (await bob.page.locator('[data-widgets-panel]').innerText()).includes('团队组件'),
    'the teammate sees the shared library’s widget, with the library name',
  );
  await add.click();
  let pb;
  await until(bob.page, async () => (pb = await project(bob.page)).widgets.some(w => w.widget.library === libId), 'the teammate installs it');
  const installed = pb.widgets.find(w => w.widget.library === libId);
  check(
    installed.widget.version === '1.0.0' && pb.library.widgetCopies?.[`${libId}/centres`]?.def.version === '1.0.0',
    'the design keeps a copy at the version installed',
  );
  await until(bob.page, async () => (await points(bob.page, installed.id)) > 0, 'the teammate’s canvas draws it');

  // A saves a new version (a new parameter); Bob's design keeps drawing 1.0.0 and is offered the update
  const saved = await a.page.evaluate(
    ([lib, def]) =>
      fetch(`/api/widget-libraries/${lib}/widgets/centres`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ def }),
      }).then(r => r.json()),
    [libId, { ...DEF, description: 'Marks the centre of every room, bigger.', params: { size: { type: 'number', default: 1, title: { zh: '大小' } } } }],
  );
  check(saved.version === '1.0.1', `a changed widget gets a new version: ${JSON.stringify(saved)}`);
  await bob.page.reload();
  await bob.page.waitForFunction(() => window.artifact?.ready);
  await openPanel(bob.page);
  const offer = bob.page.locator('[data-widget-update="1.0.1"]');
  await offer.waitFor({ timeout: 15000 });
  pb = await project(bob.page);
  check(pb.widgets.find(w => w.id === installed.id).widget.version === '1.0.0', 'nothing updates on its own: still 1.0.0, with an offer of 1.0.1');
  await offer.getByRole('button', { name: '查看' }).click();
  const dialog = bob.page.getByRole('dialog');
  await dialog.waitFor();
  const text = await dialog.innerText();
  check(
    text.includes('v1.0.0 → v1.0.1') && text.includes('新增参数：大小') && text.includes('bigger'),
    `the offer says what changed: ${text.replace(/\s+/g, ' ')}`,
  );
  await bob.page.screenshot({ path: `${OUT}/widget-libraries-2-update.png` });
  await dialog.getByRole('button', { name: '更新', exact: true }).click();
  await until(
    bob.page,
    async () => (await project(bob.page)).widgets.find(w => w.id === installed.id).widget.version === '1.0.1',
    'updating brings it to 1.0.1',
  );
  check((await project(bob.page)).library.widgetCopies[`${libId}/centres`].def.params?.size, 'the copy is the new version');

  // Export the library as a file and import it again as a new one
  await a.page.goto(`${BASE}/widgets/${libId}`);
  await a.page.locator('[data-widget-card="centres"]').waitFor({ timeout: 15000 });
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: '导出文件' }).click()]);
  const file = readFileSync(await download.path(), 'utf8');
  const exported = JSON.parse(file);
  check(
    download.suggestedFilename().endsWith('.widgetlib.json') && exported.format === 'opensu-widgets' && exported.widgets.centres?.version === '1.0.1',
    'exports the library as a widget library file',
  );
  await a.page.goto(`${BASE}/widgets`);
  await a.page.locator('input[type=file]').setInputFiles({ name: 'team.widgetlib.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await a.page.waitForURL(url => /\/widgets\/wlib/.test(url.pathname) && !url.pathname.endsWith(libId), { timeout: 15000 });
  await a.page.locator('[data-widget-card="centres"]').waitFor({ timeout: 15000 });
  check(true, 'importing the file makes a new library with its widgets');

  // Deleting the library leaves Bob's design drawing its copy
  const del = await a.page.evaluate(lib => fetch(`/api/widget-libraries/${lib}`, { method: 'DELETE' }).then(r => r.status), libId);
  check(del === 200, 'the owner deletes the library');
  await bob.page.reload();
  await bob.page.waitForFunction(() => window.artifact?.ready);
  await until(bob.page, async () => (await points(bob.page, installed.id)) > 0, 'the teammate’s design still draws its copy');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
