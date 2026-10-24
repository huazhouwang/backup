// E2E: look libraries (#81, #93): create one from the library list (top navigation), save a design's look to it, share it, another person adds the look to
// their own design together with one from the built-in Chinese library, an update shows as "newer" with before/after, export and import as a file, deleting the library leaves designs unchanged
import { readFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('libraries', async ({ browser: b }) => {
  const errors = [];
  const ROUND = {
    params: { top: 'wood' },
    script: `(
    $r := $min([$w, $d]) / 2;
    [$cylinder($r, 40, [0, $h - 20, 0], $top, {"seg": 40}), $cylinder(50, $h - 40, [0, ($h - 40) / 2, 0], 'woodDark'), $cylinder($r * 0.5, 20, [0, 10, 0], 'woodDark')]
  )`,
  };

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
  const openLooks = async page => {
    await page.getByRole('tab', { name: '属性' }).click();
    await page.getByText('本方案的外观').waitFor();
  };

  const a = await person(),
    bob = await person();

  // The account menu opens Settings
  await a.page.goto(`${BASE}/projects`);
  await a.page.getByRole('button', { name: '账号' }).click();
  await a.page.getByRole('menuitem', { name: '设置' }).click();
  await a.page.waitForURL(/\/settings/);
  check(true, 'the account menu opens Settings');

  // The top navigation opens the library list: the default library, the built-in Chinese one; A creates a library there
  await a.page.locator('header a[href="/looks"]').click();
  await a.page.waitForURL(/\/looks$/);
  await a.page.getByRole('link', { name: '打开“中式物品”' }).waitFor({ timeout: 15000 });
  check(await a.page.getByRole('link', { name: '打开“默认物品”' }).isVisible(), 'the library list shows the default and the built-in libraries');
  await a.page.getByLabel('新物品库的名字').fill('家具库');
  await a.page.getByRole('button', { name: '新建物品库' }).click();
  await a.page.waitForURL(/\/looks\/lib/);
  await a.page.getByText('还没有外观', { exact: false }).waitFor();
  check(true, 'a new library opens on its own page, empty');

  // A makes a look in the design and saves it to the library
  await a.page.goto(a.url);
  await a.page.waitForFunction(() => window.artifact?.ready);
  await a.page.evaluate(r => window.artifact.call('look_add', { name: '圆餐桌', for: ['furniture:dining'], recipe: r, use: true }), ROUND);
  await openLooks(a.page);
  await a.page.getByRole('combobox', { name: '把“圆餐桌”存入物品库' }).click();
  await a.page.getByRole('option', { name: '家具库' }).click();
  await a.page.getByText('“圆餐桌”已存入物品库').waitFor();
  let pa = await project(a.page);
  const aLook = Object.values(pa.library.looks)[0];
  check(aLook.source?.version === '1.0.0', 'saving links the design copy to the library (v1.0.0)');
  await a.page.screenshot({ path: `${OUT}/libraries-1-design.png` });

  // A opens the library from the list and shares it with Bob as an editor
  await a.page.waitForTimeout(2000);
  await a.page.goto(`${BASE}/looks`);
  await a.page.getByRole('link', { name: '打开“家具库”' }).click();
  await a.page
    .getByText('圆餐桌')
    .first()
    .waitFor({ timeout: 15000 })
    .catch(() => {});
  await a.page.screenshot({ path: `${OUT}/libraries-2-page.png` });
  await a.page.getByRole('button', { name: '管理' }).click();
  await a.page.getByLabel('对方注册用的邮箱').fill(bob.email);
  await a.page.getByRole('combobox', { name: '权限' }).click();
  await a.page.getByRole('option', { name: '可编辑' }).click();
  await a.page.getByRole('button', { name: '分享' }).click();
  await a.page.getByText(bob.email).waitFor();
  check(true, 'the library is shared with another person');
  await a.page.screenshot({ path: `${OUT}/libraries-3-manage.png` });

  // Bob adds the look to his own design
  await openLooks(bob.page);
  await bob.page.getByRole('button', { name: '从物品库添加' }).click();
  await bob.page.getByRole('button', { name: '添加并使用' }).click();
  await bob.page.getByText('已添加“圆餐桌”').waitFor();
  let pb = await project(bob.page);
  const bId = pb.library.use?.['furniture:dining'];
  check(bId && pb.library.looks[bId].source?.look === aLook.source.look, 'another person uses the same look in their design');
  check(JSON.stringify(pb.library.looks[bId].recipe) === JSON.stringify(aLook.recipe), 'both see the same look');

  // Bob also uses a look from the built-in Chinese library: one design, looks from two libraries
  await bob.page.getByRole('button', { name: '从物品库添加' }).click();
  await bob.page.getByRole('combobox', { name: '物品库' }).click();
  await bob.page.getByRole('option', { name: '中式物品' }).click();
  await bob.page.getByRole('dialog').locator('div.space-y-1', { hasText: '功夫茶台' }).getByRole('button', { name: '添加并使用' }).click();
  await bob.page.getByText('已添加“功夫茶台”').waitFor();
  pb = await project(bob.page);
  const tea = pb.library.looks[pb.library.use?.['furniture:teatable']];
  check(
    tea?.source?.library === 'builtin-chinese' && pb.library.looks[bId].source.library === aLook.source.library,
    'one design uses looks from two different libraries',
  );
  check(
    (await a.page.evaluate(async () => (await fetch('/api/libraries/builtin-chinese', { method: 'DELETE' })).status)) === 403,
    'the built-in library cannot be deleted',
  );

  // A changes the look and saves a new version; Bob is told and updates after seeing before/after
  await a.page.goto(a.url);
  await a.page.waitForFunction(() => window.artifact?.ready);
  const id = Object.keys((await project(a.page)).library.looks)[0];
  await a.page.evaluate(([id, r]) => window.artifact.call('look_update', { look: id, recipe: { ...r, params: { top: 'woodDark' } } }), [id, ROUND]);
  await openLooks(a.page);
  await a.page.getByRole('combobox', { name: '把“圆餐桌”存入物品库' }).click();
  await a.page.getByRole('option', { name: '家具库' }).click();
  await a.page.getByText('“圆餐桌”已存入物品库').waitFor();
  pa = await project(a.page);
  check(Object.values(pa.library.looks)[0].source?.version === '2.0.0', 'saving again makes v2.0.0 in the library');
  await bob.page.waitForTimeout(2500);
  await bob.page.reload();
  await bob.page.waitForFunction(() => window.artifact?.ready);
  await openLooks(bob.page);
  await bob.page.getByText('物品库里有新版本 v2.0.0').waitFor({ timeout: 10000 });
  check(true, 'the other design shows that a newer version exists');
  await bob.page.getByRole('button', { name: '更新', exact: true }).click();
  await bob.page.getByRole('img', { name: '更新后' }).waitFor({ timeout: 15000 });
  await bob.page.screenshot({ path: `${OUT}/libraries-4-update.png` });
  await bob.page.getByRole('alertdialog').getByRole('button', { name: '更新' }).click();
  await bob.page.waitForTimeout(500);
  pb = await project(bob.page);
  check(
    pb.library.looks[bId].source.version === '2.0.0' && pb.library.looks[bId].recipe.params?.top?.default === 'woodDark',
    'updating brings that design to v2.0.0',
  );

  // The library's page lays its looks out like every library's; A exports it as a file and imports the file as a new library with
  // the same looks
  await a.page.goto(`${BASE}/looks`);
  await a.page.getByRole('link', { name: '打开“家具库”' }).click();
  await a.page.getByRole('link', { name: '查看“圆餐桌”' }).waitFor({ timeout: 15000 });
  check(await a.page.getByRole('heading', { name: /^餐厨/ }).isVisible(), 'a user library groups its looks like the built-in ones');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.getByRole('button', { name: '导出文件' }).click()]);
  const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
  check(
    exported.format === 'plinth-looks' &&
      download.suggestedFilename().endsWith('.looklib.json') &&
      Object.values(exported.looks)[0]?.params?.top?.type === 'string',
    'exporting writes a library file with JSON Schema parameters',
  );
  await a.page.goto(`${BASE}/looks`);
  await a.page
    .locator('input[type=file]')
    .setInputFiles({ name: 'furniture.looklib.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await a.page.waitForURL(u => /\/looks\/lib/.test(u.pathname) && !u.pathname.endsWith(exported.id));
  await a.page.getByRole('link', { name: '查看“圆餐桌”' }).waitFor({ timeout: 15000 });
  const imported = await a.page.evaluate(async id => (await (await fetch(`/api/libraries/${id}`)).json()).library, a.page.url().split('/').pop());
  check(
    JSON.stringify(Object.values(imported.looks)[0].script) === JSON.stringify(Object.values(exported.looks)[0].script) &&
      Object.keys(imported.looks)[0] === Object.keys(exported.looks)[0],
    'importing the file makes a new library with the same looks',
  );
  await a.page.goto(`${BASE}/looks`);
  await a.page
    .locator('input[type=file]')
    .setInputFiles({ name: 'broken.looklib.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, format: 'nope' })) });
  check(
    await a.page
      .getByText('不是可用的物品库文件', { exact: false })
      .waitFor({ timeout: 10000 })
      .then(
        () => true,
        () => false,
      ),
    'a broken file is refused with the reason',
  );
  await a.page.evaluate(async id => fetch(`/api/libraries/${id}`, { method: 'DELETE' }), imported.id);

  // Deleting the library leaves designs that copied from it unchanged
  const libs = await a.page.evaluate(async () => (await fetch('/api/libraries')).json());
  await a.page.evaluate(async id => fetch(`/api/libraries/${id}`, { method: 'DELETE' }), libs.find(l => !l.builtin).id);
  await bob.page.waitForTimeout(2500);
  await bob.page.reload();
  await bob.page.waitForFunction(() => window.artifact?.ready);
  pb = await project(bob.page);
  check(
    !!pb.library.looks?.[bId] && !!tea && !!pb.library.looks[tea && pb.library.use['furniture:teatable']],
    'deleting the library keeps the designs’ copies',
  );

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
