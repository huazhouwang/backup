// E2E (issue 188): house_choose shows the generated houses as cards (a 3D still, the plan, footprint and area); tapping one builds
// it, the view turns to 3D for the build-up, the chat suggests next steps, and the funnel events are recorded.
import { test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { BASE, OUT, check } from './support.mjs';

const events = id =>
  JSON.parse(
    execFileSync(
      'node',
      [
        '../../node_modules/wrangler/bin/wrangler.js',
        'd1',
        'execute',
        'plinth',
        '--local',
        '--json',
        '--command',
        `select name, detail from event where project_id = '${id}' order by id`,
      ],
      { encoding: 'utf8' },
    ),
  )[0].results;

test('choosing a generated house', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  const { id } = await page.evaluate(() =>
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '三代同堂', template: 'blank' }),
    }).then(r => r.json()),
  );
  await page.goto(`${BASE}/p/${id}`);
  await page.waitForFunction(() => window.artifact?.ready);
  await page.evaluate(() =>
    window.artifact.call('brief_update', {
      program: {
        floors: 2,
        rooms: [{ type: 'living', area: 30 }, { type: 'kitchen' }, { type: 'dining' }, { type: 'elder', floor: 0 }, { type: 'master' }, { type: 'kids' }],
      },
    }),
  );
  // The agent's call: it waits for the owner's pick
  await page.evaluate(() => {
    window.housePick = window.artifact.call('house_choose', {});
  });
  const cards = page.locator('[aria-label="可选的方案"]');
  await cards.waitFor();
  const n = await cards.getByRole('button', { name: '选这个' }).count();
  check(n >= 2 && n <= 3, `${n} houses offered as cards`);
  // The stills are drawn one after another on the shared still renderer: on software GL in a busy run that takes a while
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="可选的方案"] img')].length >= 2, null, { timeout: 90000 });
  check(true, 'each card shows the house in 3D');
  check((await cards.locator('svg[role="img"]').count()) === n, 'and its plan');
  await page.screenshot({ path: `${OUT}/choose-1-options.png` });

  await cards.getByRole('button', { name: '选这个' }).nth(1).click();
  const chosen = await page.evaluate(() => window.housePick);
  check(chosen.ok && chosen.result.built?.id, `the agent learns what was built (${chosen.result.built?.id})`);
  const p = await page.evaluate(() => window.artifact.project());
  check(p.walls.length > 10 && p.levels.filter(l => !l.roof).length === 2, `a two-storey house was built (${p.walls.length} walls)`);
  await page.waitForURL(/mode=3d/);
  check(true, 'the view turns to 3D for the build-up');
  check((await page.locator('[aria-label="可选的方案"]').count()) === 0, 'the cards go once one is picked');
  check(await page.getByRole('button', { name: '把客厅再放大一点' }).isVisible(), 'the chat suggests next steps');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/choose-2-built.png` });

  const names = events(id).map(e => e.name);
  check(names.includes('options_shown') && names.includes('option_picked'), `funnel events recorded (${names.join(', ')})`);
  check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
});
