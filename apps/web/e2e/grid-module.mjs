// The canvas module the fake agent writes for "按承重墙排一套轴网" (issue 171): what a model is expected to write with the wheels.
// Axis lines on the bearing walls of the level shown, numbered 1, 2, 3… across and lettered A, B, C… down; until someone edits
// them they follow the walls. Click one to select it, drag it to move it, double-click its bubble to rename it; walls and every
// other tool snap to the axes and their crossings. Edits are kept per level in the module's data, so they undo and are shared.
export const GRID_MODULE = `export default function (canvas) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const g = canvas.layer();
  const stored = () => canvas.data.get() ?? {};

  function fromWalls() {
    const level = canvas.bridge.level();
    const walls = canvas.bridge.project().walls.filter(w => w.level === level && w.kind === 'bearing');
    if (!walls.length) return null;
    const xs = [], ys = [];
    const add = (list, v) => { if (!list.some(x => Math.abs(x - v) < 100)) list.push(Math.round(v)); };
    for (const { start: a, end: b } of walls) {
      if (Math.abs(a[0] - b[0]) < 1) add(xs, a[0]);
      else if (Math.abs(a[1] - b[1]) < 1) add(ys, a[1]);
    }
    xs.sort((p, q) => p - q);
    ys.sort((p, q) => p - q);
    const pts = walls.flatMap(w => [w.start, w.end]), pad = 1500;
    return {
      box: [Math.min(...pts.map(p => p[0])) - pad, Math.min(...pts.map(p => p[1])) - pad, Math.max(...pts.map(p => p[0])) + pad, Math.max(...pts.map(p => p[1])) + pad],
      axes: [
        ...xs.map((x, i) => ({ id: 'x' + i, dir: 'x', at: x, name: String(i + 1) })),
        ...ys.map((y, i) => ({ id: 'y' + i, dir: 'y', at: y, name: String.fromCharCode(65 + i) })),
      ],
    };
  }
  /** The level's grid: as edited, or else from its bearing walls */
  const grid = () => stored()[canvas.bridge.level()] ?? fromWalls();
  const save = next => canvas.data.set({ ...stored(), [canvas.bridge.level()]: next });
  const ends = (a, box) => (a.dir === 'x' ? [[a.at, box[1]], [a.at, box[3]]] : [[box[0], a.at], [box[2], a.at]]);

  function draw() {
    g.replaceChildren();
    const gr = grid();
    if (!gr) return;
    const k = canvas.view.pxMm();
    for (const a of gr.axes) {
      const [p, q] = ends(a, gr.box);
      const axis = el('g', { 'data-axis-group': a.id });
      axis.append(el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '12 4 2 4', 'data-axis-line': a.id }));
      const hit = el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: 'transparent', 'stroke-width': 12 * k, 'data-axis': a.id });
      canvas.selectable(hit, 'axis:' + a.id);
      // Dragging moves the axis's group (not redrawn while held, so the pointer stays captured); let go to keep it
      let to = null;
      canvas.draggable(hit, {
        snap: false,
        move(s) {
          to = Math.round(s.point[a.dir === 'x' ? 0 : 1] / 10) * 10;
          axis.setAttribute('transform', a.dir === 'x' ? 'translate(' + (to - a.at) + ' 0)' : 'translate(0 ' + (to - a.at) + ')');
        },
        end(s) {
          if (!s || to === null) return;
          save({ ...gr, axes: gr.axes.map(x => (x.id === a.id ? { ...x, at: to } : x)) });
        },
      });
      axis.append(hit);
      const r = 9 * k;
      const c = a.dir === 'x' ? [a.at, gr.box[1] - r] : [gr.box[0] - r, a.at];
      const bubble = el('g', { 'data-axis-label': a.id, style: 'cursor:text' });
      bubble.append(el('circle', { cx: c[0], cy: c[1], r, fill: 'var(--background)', 'vector-effect': 'non-scaling-stroke' }));
      const t = el('text', { x: c[0], y: c[1], 'font-size': 11 * k, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: 'var(--foreground)' });
      t.textContent = a.name;
      bubble.append(t);
      bubble.addEventListener('dblclick', e => rename(a, e));
      axis.append(bubble);
      g.append(axis);
    }
    restyle();
  }

  /** Show which axes are selected (restyled, not redrawn: a double-click needs its bubble to stay) */
  function restyle() {
    for (const axis of g.querySelectorAll('[data-axis-group]')) {
      const sel = canvas.isSelected('axis:' + axis.getAttribute('data-axis-group'));
      const stroke = sel ? 'var(--canvas-selection)' : 'var(--chart-2)';
      const line = axis.querySelector('[data-axis-line]');
      line.setAttribute('stroke', stroke);
      line.setAttribute('stroke-width', sel ? 2 : 1);
      line.toggleAttribute('data-selected', sel);
      axis.querySelector('circle').setAttribute('stroke', stroke);
    }
  }

  function rename(a, e) {
    const input = document.createElement('input');
    input.value = a.name;
    input.setAttribute('data-axis-rename', a.id);
    Object.assign(input.style, { position: 'fixed', left: e.clientX - 30 + 'px', top: e.clientY - 12 + 'px', width: '60px', font: 'inherit', padding: '2px 4px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--background)', color: 'var(--foreground)' });
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      input.remove();
      const gr = grid();
      if (ok && name && name !== a.name) save({ ...gr, axes: gr.axes.map(x => (x.id === a.id ? { ...x, name } : x)) });
    };
    input.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    document.body.append(input);
    input.select();
    input.focus();
  }

  canvas.addSnaps({
    lines: () => {
      const gr = grid();
      return gr ? gr.axes.map(a => ends(a, gr.box)) : [];
    },
    points: () => {
      const gr = grid();
      if (!gr) return [];
      const xs = gr.axes.filter(a => a.dir === 'x'), ys = gr.axes.filter(a => a.dir === 'y');
      return xs.flatMap(x => ys.map(y => [x.at, y.at]));
    },
  });
  canvas.data.on(draw);
  canvas.view.onDraw(draw);
  canvas.onSelection(restyle);
  canvas.bridge.on('level', draw);
  canvas.bridge.on('project', draw);
  draw();
}
`;
