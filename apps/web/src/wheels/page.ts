/**
 * The default canvas page, built from the wheels like any page an agent might write: the plan, selecting and dragging the
 * design's walls, doors and windows and furniture (the same moves and snapping as the editor's plan, made through the same
 * capabilities), the wall tool, and a small toolbar. Agent modules run on top of it with the same `canvas` it uses.
 */
import type { Point } from '@plinth/core';
import { overwriteGetLocale } from '@/paraglide/runtime';
import { m } from '@/lib/i18n';
import { dragCall, draggable as canDrag } from '@/features/editor/plan/plan-drag';
import { bridge, connect, onCapture, onMine, onTry, post } from './bridge';
import { svgToPng } from '@/lib/theme';
import { settled, syncModules, tryModule } from './modules';
import { addSnaps, draggable, isSelected, onSelection, selectable, snap, SNAP_PX, snapPoints, type SnapProvider } from './interact';
import { mount, svgEl, type PlanView } from './plan';
import { button, toolbar, type Button } from './ui';
import { wallTool } from './walls';

/** What a page and its modules work with */
export interface Canvas {
  bridge: typeof bridge;
  view: PlanView;
  addSnaps: typeof addSnaps;
  snap: typeof snap;
  selectable: typeof selectable;
  draggable: (el: Element, opts: Parameters<typeof draggable>[2]) => void;
  isSelected: typeof isSelected;
  onSelection: typeof onSelection;
  wallTool: (opts?: Parameters<typeof wallTool>[1]) => ReturnType<typeof wallTool>;
  /** Select these ids (the design's objects and a module's own; same as bridge.select) */
  select: typeof bridge.select;
  /** The page's toolbar (bottom centre) */
  toolbar: HTMLElement;
  /** Add a button to the toolbar; returns it (b.setPressed(on) shows a toggle on or off; b.remove() takes it away) */
  button(label: string, onClick: () => void, opts?: { pressed?: boolean; title?: string }): Button;
}

/** The design's own snaps: wall ends */
const wallEnds: SnapProvider = {
  points: () =>
    bridge
      .project()
      .walls.filter(w => w.level === bridge.level())
      .flatMap(w => [w.start, w.end]),
};

/** Dragging the selected wall, door or window or piece of furniture, previewing its outline and guides, made on release */
function modelDrag(view: PlanView) {
  const layer = view.layer('drag');
  let held: { id: string; from: Point; pointer: number } | null = null;
  view.svg.addEventListener(
    'pointerdown',
    e => {
      if (e.button !== 0 || !bridge.canEdit()) return;
      const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
      if (!id || !isSelected(id) || bridge.selection().length !== 1 || !canDrag(bridge.project(), id)) return;
      e.preventDefault();
      view.svg.setPointerCapture(e.pointerId);
      held = { id, from: view.toModel(e), pointer: e.pointerId };
    },
    { capture: true },
  );
  const call = (e: PointerEvent) => {
    if (!held) return null;
    const p = view.toModel(e);
    return dragCall(bridge.project(), held.id, [p[0] - held.from[0], p[1] - held.from[1]], SNAP_PX * view.pxMm(), snapPoints());
  };
  view.svg.addEventListener('pointermove', e => {
    if (!held || e.pointerId !== held.pointer) return;
    const r = call(e);
    layer.replaceChildren();
    if (!r) return;
    for (const [a, b] of r.guides)
      layer.appendChild(
        svgEl('line', {
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          stroke: 'var(--canvas-selection)',
          'stroke-dasharray': '4 3',
          'vector-effect': 'non-scaling-stroke',
        }),
      );
    if (r.readout) {
      const [x, y] = view.toModel(e),
        k = view.pxMm();
      const t = svgEl('text', { x: x + 12 * k, y: y - 12 * k, 'font-size': 12 * k, fill: 'var(--canvas-selection)' });
      t.textContent = r.readout;
      layer.appendChild(t);
    }
  });
  view.svg.addEventListener('pointerup', e => {
    if (!held || e.pointerId !== held.pointer) return;
    const r = call(e);
    held = null;
    layer.replaceChildren();
    if (r) void bridge.call(r.name, r.input);
  });
}

/** Lay out the default page in `root`; returns the canvas modules use */
export function defaultPage(root: HTMLElement): Canvas {
  root.style.cssText = 'position:fixed;inset:0';
  const stage = document.createElement('div');
  stage.style.cssText = 'position:absolute;inset:0';
  // Along the bottom: the editor keeps its own controls in the top corners
  const bar = toolbar();
  bar.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%)';
  root.appendChild(stage);
  root.appendChild(bar);
  const view = mount(stage);
  addSnaps(wallEnds);
  modelDrag(view);

  let walls: ReturnType<typeof wallTool> | null = null;
  const select = button(m.wheels_select(), () => view.setTool(null), { pressed: true });
  const wall = button(m.wheels_wall(), () => view.setTool((walls = wallTool(view))), { pressed: false });
  // Which tool is on shows on its button; a module's own tool leaves both off
  view.onTool(t => {
    select.setPressed(t === null);
    wall.setPressed(t !== null && t === walls);
  });
  const sync = () => (wall.disabled = !bridge.canEdit());
  sync();
  bridge.on('canEdit', sync);
  bar.appendChild(select);
  bar.appendChild(wall);

  return {
    bridge,
    view,
    addSnaps,
    snap,
    selectable,
    draggable: (el, opts) => draggable(view, el, opts),
    isSelected,
    onSelection,
    wallTool: opts => wallTool(view, opts),
    select: ids => bridge.select(ids),
    toolbar: bar,
    button(label, onClick, opts) {
      const b = button(label, onClick, opts);
      bar.appendChild(b);
      return b;
    },
  };
}

/** Start the page: wait for the editor, then draw; says when it is ready and how long it took */
export async function start(): Promise<Canvas> {
  const t0 = performance.now();
  const init = await connect();
  overwriteGetLocale(() => init.locale);
  document.documentElement.lang = init.locale === 'zh' ? 'zh-CN' : init.locale;
  const canvas = defaultPage(document.body);
  // The design's own modules run on top, and follow the design as it changes
  await syncModules(canvas);
  let modules = init.project.canvas?.modules;
  bridge.on('project', p => {
    if (p.canvas?.modules === modules) return;
    modules = p.canvas?.modules;
    void syncModules(canvas);
  });
  let mine = init.mine.modules;
  onMine(page => {
    if (page.modules === mine) return;
    mine = page.modules;
    void syncModules(canvas);
  });
  onTry((scope, id, source) => tryModule(canvas, scope, id, source));
  onCapture(async () => {
    await settled();
    await new Promise(r => requestAnimationFrame(r));
    return svgToPng(canvas.view.svg);
  });
  requestAnimationFrame(() =>
    post({
      type: 'ready',
      perf: { firstDrawMs: Math.round(performance.now() - t0), bundleBytes: (globalThis as { plinthBytes?: number }).plinthBytes ?? 0 },
    }),
  );
  return canvas;
}
