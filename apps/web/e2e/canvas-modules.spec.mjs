// E2E: canvas modules (issue 171, phase B): a module saved in the design runs in the sandboxed page on top of the default one,
// is tried there before it is saved (one that throws is refused with its error), keeps its data in the design (undoable),
// is replaced and removed cleanly (what it added goes with it); with the page closed, modules are saved untried
import { test } from '@playwright/test';
import { BASE, check } from './support.mjs';

test('canvas modules', async ({ browser: b }) => {
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /打开样例方案/ }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForFunction(() => window.artifact?.ready);
  const project = () => page.evaluate(() => window.artifact.project());
  const call = (name, input) => page.evaluate(([n, i]) => window.artifact.call(n, i), [name, input]);

  // With the sample room off, a module is saved untried
  const off = await call('canvas_module_put', { id: 'probe', name: '探针', source: 'export default function () {}' });
  check(off.ok && off.result.tried === false, `saved untried while no page is open (${JSON.stringify(off.result)})`);
  await call('canvas_module_remove', { id: 'probe' });

  await page.evaluate(() => localStorage.setItem('plinth.sandboxCanvas', '1'));
  await page.reload();
  await page.waitForFunction(() => window.artifact?.ready);
  const iframe = page.locator('iframe[data-sandbox-canvas]');
  await page.locator('iframe[data-sandbox-canvas][data-ready]').waitFor({ timeout: 30000 });
  const frame = await (await iframe.elementHandle()).contentFrame();
  const until = async (f, what) => {
    for (let i = 0; i < 40; i++) {
      if (await f()) return check(true, what);
      await page.waitForTimeout(150);
    }
    check(false, what);
  };

  // A module that draws its data and adds a button
  const SOURCE = v => `export default function (canvas) {
    const g = canvas.layer();
    const draw = () => {
      g.replaceChildren();
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('data-probe', '${v}');
      t.setAttribute('x', 0); t.setAttribute('y', 0);
      t.textContent = String((canvas.data.get() ?? {}).count ?? 0);
      g.appendChild(t);
    };
    canvas.data.on(draw);
    draw();
    canvas.toolbar.appendChild(canvas.button('+1', () => canvas.data.set({ count: ((canvas.data.get() ?? {}).count ?? 0) + 1 })));
  }`;
  const saved = await call('canvas_module_put', { id: 'counter', name: '计数', description: 'Counts clicks.', source: SOURCE('v1') });
  check(
    saved.ok && saved.result.tried === true && saved.result.version === 1,
    `tried in the page, then saved (${JSON.stringify(saved.result ?? saved.error)})`,
  );
  await until(async () => (await frame.locator('[data-probe="v1"]').count()) === 1, 'the page runs the saved module');

  // Its button changes its data through the design: undoable
  await frame.getByRole('button', { name: '+1' }).click();
  await frame.getByRole('button', { name: '+1' }).click();
  await until(async () => (await frame.locator('[data-probe="v1"]').textContent()) === '2', 'its data lives in the design and comes back to it');
  check((await page.evaluate(() => window.artifact.project())).canvas.data.counter.count === 2, 'kept in the design');
  await call('history_undo', {});
  await until(async () => (await frame.locator('[data-probe="v1"]').textContent()) === '1', 'undo takes a change of its data back');

  // A module that throws is refused with its error, and the saved one keeps running
  const bad = await call('canvas_module_put', { id: 'counter', name: '计数', source: 'export default function (canvas) { canvas.nope.boom(); }' });
  check(
    !bad.ok && /TypeError: Cannot read properties of undefined/.test(bad.error.message),
    `a module that throws comes back as the error (${bad.error?.message})`,
  );
  await until(async () => (await frame.locator('[data-probe="v1"]').count()) === 1, 'the saved version still runs');
  check((await frame.getByRole('button', { name: '+1' }).count()) === 1, 'and what the trial added is gone (one button)');

  // Replacing it swaps what it drew; removing it takes everything it added away
  const v2 = await call('canvas_module_put', { id: 'counter', name: '计数', source: SOURCE('v2') });
  check(v2.ok && v2.result.version === 2, 'replaced at version 2');
  await until(
    async () => (await frame.locator('[data-probe="v2"]').count()) === 1 && (await frame.locator('[data-probe="v1"]').count()) === 0,
    'the new version replaces the old',
  );
  check((await frame.getByRole('button', { name: '+1' }).count()) === 1, 'still one button');
  await call('canvas_module_remove', { id: 'counter' });
  await until(
    async () => (await frame.locator('[data-probe]').count()) === 0 && (await frame.getByRole('button', { name: '+1' }).count()) === 0,
    'removing it removes what it added',
  );

  // What the trial put on the page comes back with the save, and the page can be screenshotted
  const DRAG = `export default function (canvas) {
    const g = canvas.layer();
    let x = null;
    const at = () => x ?? (canvas.data.get() ?? {}).x ?? 0;
    const draw = () => {
      g.replaceChildren();
      const k = canvas.view.pxMm();
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      for (const [a, v] of Object.entries({ x: at(), y: 0, width: 60 * k, height: 60 * k, fill: 'var(--chart-2)', 'data-dragme': '' })) r.setAttribute(a, v);
      // Redrawn on every move: the drag must survive its element being replaced
      canvas.draggable(r, { snap: false, move(s) { x = Math.round(s.point[0]); draw(); }, end(s) { if (s) canvas.data.set({ x }); x = null; } });
      g.appendChild(r);
    };
    canvas.data.on(draw);
    canvas.view.onDraw(draw);
    draw();
    canvas.button('拖我', () => {});
  }`;
  const dragger = await call('canvas_module_put', { id: 'dragger', name: '拖动', source: DRAG });
  const drawn = dragger.result?.drawn;
  check(drawn?.byTag?.rect === 1 && drawn.buttons?.includes('拖我'), `the save says what the trial drew (${JSON.stringify(drawn)})`);
  await until(async () => (await frame.getByRole('button', { name: '拖我' }).count()) === 1, 'a module button appears in the toolbar by itself');
  const shot = await call('view_screenshot', {});
  check(shot.ok && shot.result.image.startsWith('data:image/png;base64,'), 'view_screenshot shows the sample room');

  const rect = async () => frame.locator('[data-dragme]').boundingBox();
  const r0 = await rect();
  const fromX = r0.x + r0.width / 2,
    fromY = r0.y + r0.height / 2;
  // While a tool has the pointer, pressing on it doesn't drag it
  await frame.getByRole('button', { name: '画墙' }).click();
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(fromX + 60, fromY, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check((await project()).canvas.data?.dragger === undefined, 'nothing is dragged while the wall tool is on');
  await frame.getByRole('button', { name: '选择' }).click();
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(fromX + 30, fromY, { steps: 5 });
  await page.mouse.move(fromX + 80, fromY, { steps: 5 });
  await page.mouse.up();
  await until(async () => ((await project()).canvas.data?.dragger?.x ?? 0) > 0, 'a drag keeps going when the module redraws on every move');
  await call('canvas_module_remove', { id: 'dragger' });

  // The agent's reference is there
  const doc = await call('canvas_wheels', {});
  check(doc.ok && doc.result.doc.includes('canvas.addSnaps'), 'canvas_wheels returns the wheel reference');

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
});
