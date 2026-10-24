// E2E: placing and editing directly → add a window from the palette onto a wall → set its width in the props panel → place an
// armchair → R turns it → its handle turns it → Delete removes it; each one edit through the capability registry
import { test } from '@playwright/test';
import { BASE, OUT, check } from './support.mjs';

test('edit', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const call = (name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);
  const frame = page.frames().find(f => f !== page.mainFrame());
  const iframe = await page.locator('iframe[title="画布"], iframe[title="Canvas"]').first().boundingBox();
  /** Page coordinates of a plan point in millimetres */
  const at = async (x, y) => {
    const q = await frame.evaluate(
      ([x, y]) => {
        const svg = document.querySelector('svg[role="img"]');
        const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
        return [p.x, p.y];
      },
      [x, y],
    );
    return [iframe.x + q[0], iframe.y + q[1]];
  };
  const openings = async () => (await call('get_object', { ref: 'L1-w15' })).result.openings;
  const add = async name => {
    await page.getByRole('button', { name: '添加门窗或家具' }).click();
    await page.getByRole('option', { name, exact: true }).click();
  };

  // A window onto the south wall of 老人房二 (from x = 9580), where it is free, 4.2 m from the wall's start
  const n0 = (await openings()).length;
  await add('窗');
  const [wx, wy] = await at(13800, 10350);
  await page.mouse.move(wx, wy);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/edit-place-window.png` });
  await page.mouse.click(wx, wy);
  await page.waitForTimeout(500);
  const added = (await openings()).find(o => Math.abs(o.at - 4200) < 1);
  check((await openings()).length === n0 + 1 && added, `a click puts the window on the wall at 4200 mm (${added?.at})`);

  // Its width, typed in the props panel
  await page.getByRole('tab', { name: '属性' }).click();
  const width = page.getByRole('spinbutton').first();
  await width.fill('1200');
  await width.press('Enter');
  await page.waitForTimeout(300);
  check((await call('get_object', { ref: added.id })).result.width === 1200, 'typing a width in the props panel resizes the window');

  // An armchair in the living room
  const count = async () => (await call('find_objects', { type: 'furniture', limit: 200 })).result.length;
  const f0 = await count();
  await add('单人椅');
  const [cx, cy] = await at(6000, 2050);
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(500);
  check((await count()) === f0 + 1, 'a click places the armchair');
  const first = (await call('view_get', {})).result.selection[0];
  const chair = first?.id ?? first;
  check(!!chair, `the placed armchair is selected (${chair})`);

  // R turns it a quarter, its handle to the east turns it to 90°
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  check((await call('get_object', { ref: chair })).result.rotation === 90, 'R turns the selected furniture 90°');
  await call('furniture_move', { furniture: chair, rotation: 0 });
  await page.waitForTimeout(300);
  const handle = await frame.locator('circle.plan-drag').boundingBox();
  // A frame element's box is already in page coordinates
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const [ex, ey] = await at(9000, 2050);
  await page.mouse.move(ex, ey, { steps: 10 });
  await page.screenshot({ path: `${OUT}/edit-rotate.png` });
  await page.mouse.up();
  await page.waitForTimeout(400);
  check((await call('get_object', { ref: chair })).result.rotation === 90, 'dragging the handle east turns it to 90°');

  // Delete removes it
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  check((await count()) === f0, 'Delete removes the selected furniture');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
});
