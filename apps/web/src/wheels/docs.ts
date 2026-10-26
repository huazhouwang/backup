/**
 * The wheels' reference, as the agent reads it (canvas_wheels): what a canvas module receives, every wheel with its calls, and a
 * worked example. Kept next to the wheels so it changes with them.
 */
export const WHEELS_DOC = `# Canvas wheels

The canvas is a sandboxed web page (no network, no access to the editor). It runs the default page, then this design's
modules. A module is an ES module:

    export default function (canvas) {
      // draw, listen, add tools… everything added through canvas goes away when the module stops
      return () => { /* optional extra cleanup */ };
    }

You may also \`import { … } from 'plinth'\` (the same wheels as plain functions). Coordinates are plan millimetres: x east, y south.
Colours: use theme variables only, e.g. var(--foreground), var(--canvas-selection), var(--muted-foreground), var(--chart-2).

## canvas.bridge — the design
- project(): the design (levels, walls [{id, level, start, end, thickness, kind, openings}], spaces [{id, level, name, kind, shape:[{outer, holes}]}], furniture [{id, level, position, rotation, size:{w,d,h}}]…)
- level(): the level shown (id). selection(): selected ids. canEdit(): whether the person may change the design. locale(): 'zh' | 'en'
- on('project' | 'level' | 'selection' | 'canEdit', fn): listen (removed when the module stops)
- select(ids): select (the design's objects are selected in the editor too; your own ids stay in the page)
- call(name, input): run a capability as the person (wall_add, wall_move, furniture_move, …) → {ok, result?, error?}. Edits are checked by the building rules and undo like any other.

## canvas.data — your module's state, kept where the module is
- get(): your JSON (undefined at first). set(value): save it. on(fn): hear changes (undo, other people).
- A design's module keeps it in the design (canvas_data_set: undoable, shared). A user's own module (canvas.scope === 'me') keeps it in their settings.
Keep everything the user makes with your module here, never only in variables.

## canvas.view — the plan
- layer(name?): via canvas.layer(name) — an <g> above the plan for you to draw in (SVG, plan millimetres; cleared when you stop)
- toModel(event) → [x, y] mm. pxMm(): millimetres per screen pixel (for strokes, text and hit areas of a fixed screen size)
- shapes(): the level's drawing as the editor computes it (walls, spaces, openings with outlines)
- setTool(tool | null): take the pointer: {cursor?, down?(p, e) → true to keep it, move?(p, e), up?(p, e), key?(e), stop?()}; Esc gives it back
- onDraw(fn): after the plan redraws (design, level or zoom changed) — redraw what depends on the zoom here
- fit(): fit the level

## Interaction — behave like the rest of the plan
- canvas.selectable(el, id): a click selects it (shift adds); check canvas.isSelected(id) / canvas.onSelection(fn) to show it selected (e.g. stroke var(--canvas-selection))
- canvas.draggable(el, {start?(p), move(snapped, e), end(snapped | null, e), snap?}): follow the pointer in mm; snapped = {point, kind, guides}; end gets null for a click
- canvas.addSnaps({points?() → [[x,y]…], lines?() → [[[x1,y1],[x2,y2]]…]}): offer snap points and lines (lines extend past their ends). Every tool snaps to them: the wall tool, dragging, other modules.
- canvas.snap(p, tolMm) → {point, kind: 'point' | 'line' | 'cross' | null, guides}: snap a point yourself (tol: 10 * view.pxMm())
- canvas.wallTool({kind?, thickness?, onDone?}): the wall tool (two clicks per wall, snapping, wall_add); pass it to view.setTool
- canvas.button(label, onClick, {pressed?, title?}) and canvas.toolbar: add buttons to the page's toolbar (labels in canvas.bridge.locale())

## Example: named reference lines anyone can drag, that walls snap to
    export default function (canvas) {
      const g = canvas.layer();
      const lines = () => canvas.data.get() ?? [];
      const draw = () => {
        g.replaceChildren();
        const k = canvas.view.pxMm();
        lines().forEach((l, i) => {
          const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          Object.entries({ x1: l.a[0], y1: l.a[1], x2: l.b[0], y2: l.b[1], stroke: canvas.isSelected('ref-' + i) ? 'var(--canvas-selection)' : 'var(--chart-2)', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '8 3 2 3' })
            .forEach(([a, v]) => el.setAttribute(a, v));
          const hit = el.cloneNode(); hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 10);
          canvas.selectable(hit, 'ref-' + i);
          canvas.draggable(hit, { move() {}, end(s) { if (!s) return; /* move line i to s.point, then */ canvas.data.set(lines()) } });
          g.append(el, hit);
        });
      };
      canvas.addSnaps({ lines: () => lines().map(l => [l.a, l.b]) });
      canvas.data.on(draw); canvas.view.onDraw(draw); canvas.onSelection(draw); draw();
    }
`;
