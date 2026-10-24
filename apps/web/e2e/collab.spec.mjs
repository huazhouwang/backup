// E2E: share link → family member (guest, commenter) opens it → comments on an object → agent replies and marks "pending owner confirmation" → version rollback → mobile layout
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('collab', async ({ browser: b }) => {
  const apiOn = page => (path, init) =>
    page.evaluate(
      async ([p, i]) => {
        const r = await fetch(`/api${p}`, { ...i, headers: { 'Content-Type': 'application/json' } });
        return { status: r.status, body: await r.json() };
      },
      [path, init],
    );

  // Owner
  const owner = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await owner.goto(BASE, { waitUntil: 'networkidle' });
  await owner.getByRole('button', { name: /打开样例方案/ }).click();
  await owner.waitForURL(/\/p\//);
  const projectId = owner.url().match(/\/p\/([^/?]+)/)[1];
  await owner.waitForFunction(() => window.artifact?.ready);
  const oapi = apiOn(owner);
  const link = await oapi(`/projects/${projectId}/links`, { method: 'POST', body: JSON.stringify({ role: 'commenter' }) });
  check(link.status === 200, 'commenter share link created');

  // Family member: opens the link on a phone
  const fam = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await fam.goto(`${BASE}/s/${link.body.token}`, { waitUntil: 'networkidle' });
  check(await fam.getByText('你的权限：可评论').isVisible(), 'share page shows the permission');
  await fam.getByRole('button', { name: '打开方案' }).click();
  await fam.waitForURL(/\/p\//);
  await fam.waitForFunction(() => window.artifact?.ready);
  await fam.waitForTimeout(1000);
  await fam.screenshot({ path: `${OUT}/mobile-1.png` });
  const edit = await fam.evaluate(() => window.artifact.call('wall_move', { wall: '一层·老人房一西墙', direction: 'west', distance: 100 }));
  check(edit.ok === false && edit.error.code === 'forbidden', 'commenters cannot edit the plan');
  const fapi = apiOn(fam);
  const put = await fapi(`/projects/${projectId}`, { method: 'PUT', body: JSON.stringify({ base: 1, content: {} }) });
  check(put.status === 403, `server also rejects the save: ${put.status}`);

  // Comment on an object: select the kitchen, open the comments panel
  const kitchen = await fam.evaluate(() => window.artifact.project().spaces.find(s => s.name === '厨房').id);
  await fam.evaluate(id => window.artifact.call('view_focus', { ids: [id] }), kitchen);
  await fam.getByRole('button', { name: '评论' }).click();
  await fam.getByPlaceholder('写评论…').fill('厨房窗户能不能再高一点？');
  await fam.getByRole('button', { name: '发表' }).click();
  const tagged = await fam
    .getByText('@厨房')
    .first()
    .waitFor({ timeout: 10000 })
    .then(
      () => true,
      () => false,
    );
  check(tagged, 'comment is attached to the kitchen');
  await fam.screenshot({ path: `${OUT}/mobile-2-comment.png` });
  await fam.keyboard.press('Escape');

  // The bottom sheet keeps its height and its panel scrolls, rather than growing past the screen
  await fam.getByRole('navigation').getByRole('button', { name: '面积' }).click();
  const sheetPanel = fam.locator('[data-slot=sheet-content] [role=tabpanel]:not([hidden])').first();
  await sheetPanel.waitFor();
  await fam.waitForTimeout(500); // slide-in transition
  const fit = await sheetPanel.evaluate(e => ({ sh: e.scrollHeight, ch: e.clientHeight, vh: innerHeight, bottom: e.getBoundingClientRect().bottom }));
  check(fit.sh > fit.ch && fit.bottom <= fit.vh, `mobile sheet panel scrolls within the screen: ${JSON.stringify(fit)}`);
  await fam.keyboard.press('Escape');

  // Owner: agent handles the comment (calls capabilities directly to exercise the comment tools)
  const list = await owner.evaluate(() => window.artifact.call('comments_list', {}));
  check(list.ok && list.result.length === 1 && list.result[0].target_name === '厨房', 'owner sees the comment');
  const reply = await owner.evaluate(
    id =>
      window.artifact.call('comment_reply', { comment: id, body: '可以把窗台从 1.2 米降到 0.9 米，或者窗加高 0.3 米，您选哪个？', status: 'pending-confirm' }),
    list.result[0].id,
  );
  check(reply.ok, 'agent replies to the comment');
  const after = await oapi(`/projects/${projectId}/comments`);
  check(after.body.find(c => !c.parent_id).status === 'pending-confirm', 'comment marked pending owner confirmation');

  // Versions: make a change, then roll back
  await owner.evaluate(() => window.artifact.call('space_set_area', { space: '一层·老人房一', area: 13 }));
  await owner.waitForFunction(() => document.body.innerText.includes('第 2 版'), null, { timeout: 15000 });
  const vers = await oapi(`/projects/${projectId}/versions`);
  check(vers.body.length === 2, `${vers.body.length} versions`);
  await owner.getByRole('tab', { name: '版本' }).click();
  await owner.getByText('第 1 版', { exact: false }).first().click();
  await owner.getByText('正在查看第 1 版').waitFor();
  await owner.getByRole('button', { name: '回退到这一版' }).click();
  await owner.waitForFunction(() => document.body.innerText.includes('第 3 版'), null, { timeout: 15000 });
  const area = await owner.evaluate(() => window.artifact.call('get_object', { ref: '一层·老人房一' }));
  check(Math.abs(area.result.netArea - 12) < 0.05, `after rollback the room is back to ${area.result.netArea} m² (saved as version 3)`);
  await owner.screenshot({ path: `${OUT}/versions.png` });

  // Project list thumbnail
  await owner.waitForTimeout(3500);
  const projects = await oapi('/projects');
  check(/^(<svg|data:image\/jpeg;base64,)/.test(projects.body[0].thumbnail ?? ''), 'thumbnail generated after save (a 3D still, or the plan)');
});
