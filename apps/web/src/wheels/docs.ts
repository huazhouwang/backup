/**
 * The wheels' reference, as the agent reads it (canvas_wheels): what a canvas module receives, every wheel with its calls, and a
 * worked example. Kept next to the wheels so it changes with them; what it says was checked against agents writing modules from
 * it alone.
 */
export const WHEELS_DOC = `# Canvas wheels

The canvas is a sandboxed web page (no network, no access to the editor, no alert/prompt/confirm). It runs the default page
(the plan, selecting, dragging the design's objects, a toolbar with 选择 and 画墙), then this design's modules. A module is an
ES module:

    export default function (canvas) {
      // draw, listen, add tools… everything added through canvas goes away when the module stops
      return () => { /* optional extra cleanup, e.g. document listeners you added yourself */ };
    }

You may also \`import { … } from 'plinth'\` (the same wheels as plain functions). Modules other people published are wheels too:
look in canvas_wheel_list before writing one, and publish yours with canvas_wheel_publish when it is worth reusing.
Coordinates are plan millimetres: x east, y south. Colours: theme variables only, e.g. var(--foreground), var(--chart-2),
var(--canvas-selection) (selected), var(--muted-foreground), var(--background), var(--border).

## canvas.bridge — the design
- project(): the whole design; read it in the module instead of querying from outside. Fields:
  language ('zh' | 'en': write labels in it); levels [{id, name, elevation, height}];
  walls [{id, level, start:[x,y], end:[x,y], thickness, kind: 'bearing'|'partition'|'fence'|'parapet'|'railing', openings:[…]}]
  (start/end are the wall's centreline); spaces [{id, level, name, kind: 'indoor'|'semi-outdoor'|'outdoor'|'roof-terrace'|'void',
  shape:[{outer:[[x,y]…], holes:[…]}]}] (outlines on wall centrelines); furniture [{id, level, position:[x,y], rotation, size:{w,d,h}}];
  elements (stairs…).
- level(): the level shown (an id). selection(): selected ids. canEdit(): whether the person may change the design. locale(): 'zh' | 'en'
- on('project' | 'level' | 'selection' | 'canEdit', fn): listen (removed when the module stops)
- call(name, input): run a capability as the person (wall_add, wall_move, furniture_move, …) → Promise<{ok, result?, error?}>. Edits
  are checked by the building rules (a wall through a cabinet is refused) and undo like any other.

## canvas.data — your module's state, kept where the module is
- get(): your JSON (undefined at first). set(value): save it (returns a promise of {ok, error?}). on(fn): hear changes (undo, other people).
- A design's module keeps it in the design (undoable, shared). A user's own module (canvas.scope === 'me') keeps it in their settings.
- Keep everything the user makes with your module here, never only in variables. Give items stable ids (not array indexes).
- With no data yet, derive what to show from the design (e.g. a grid from the bearing walls) and save only when the person edits it:
  nobody needs to press a button or seed data first (the agent can't press your buttons, and the trial run doesn't save).

## canvas.view — the plan
- canvas.layer(name = 'main'): an SVG <g> above the plan for you to draw in, in plan millimetres; each name is its own group (later
  names lie higher), the same name gives the same group; cleared when your module stops.
- toModel(event) → [x, y] mm. pxMm(): millimetres per screen pixel. Sizes meant for the screen are multiplied by it: a 12 px font is
  font-size 12 * pxMm(); a 1 px line is stroke-width 1 with vector-effect non-scaling-stroke.
- shapes(): the level's drawing as the editor computes it: {bounds:[x0,y0,x1,y1], spaces:[{s: the space, d: its SVG path, label:[x,y]
  where the plan writes its name (the area goes on the line below), area: m²}], walls:[{w, d}], openings, furniture:[{f, d}], elements}.
  The plan's room names are about max(220, min(420, (x1 - x0) / 45)) mm tall: put your own text clear of them.
- onDraw(fn): after the plan redraws: design changed, level switched, zoom or pan. Redraw what you show here (it covers level switches).
- setTool(tool | null): take the pointer. tool = {cursor?, down?(p, e), move?(p, e), up?(p, e), key?(e), stop?()}. p is the raw
  pointer in mm: snap it yourself with canvas.snap. Return true from down() for presses you use (otherwise the plan pans). Esc ends
  the tool (stop() is called); setTool(null) ends it from your code. tool() is the active one, onTool(fn) hears changes.
- fit(): fit the level.

## Interaction — behave like the rest of the plan
- canvas.selectable(el, id): a click selects it (shift adds). Ids of your own (e.g. 'grid:a3') stay in the page; the design's ids are
  selected in the editor too. canvas.select(ids) selects from code; canvas.isSelected(id), canvas.onSelection(fn).
  When the selection changes, restyle your elements (set stroke) rather than rebuilding them, or a double-click on them never lands.
- canvas.draggable(el, {start?(p), move(snapped, e), end(snapped | null, e), snap?}): follow the pointer once pressed on el.
  snapped = {point:[x,y], kind: 'point'|'line'|'cross'|null, guides} (never null in move; snap: false gives the raw point, kind null);
  end gets null for a click (no movement). You may redraw (even replace el) while dragging. While a tool is active, nothing is draggable.
  Leave the item being dragged out of your own snaps, or it snaps to itself.
- canvas.addSnaps({points?() → [[x,y]…], lines?() → [[[x1,y1],[x2,y2]]…]}): offer snap points and lines (lines extend past their
  ends). Every tool in the page snaps to them: the wall tool, dragging, other modules (not the editor's own canvas).
- canvas.snap(p, tolMm) → snapped as above: snap a point yourself (tol: 10 * canvas.view.pxMm()).
- canvas.wallTool({kind?, thickness?, onDone?(wallId)}): the wall tool (two clicks per wall, snapping, Shift for level/upright,
  wall_add); start it with canvas.view.setTool(canvas.wallTool()). The toolbar's 画墙 button already does this.
- canvas.button(label, onClick, {pressed?, title?}): adds a button to the toolbar and returns it; b.setPressed(true/false) shows a
  toggle on or off (e.g. canvas.view.onTool(t => b.setPressed(t === myTool))). Labels in canvas.bridge.locale().
- Keys: the page gets the keyboard while the person works in it. Listen with document.addEventListener('keydown', …) (remove it in
  your cleanup) and call e.preventDefault() for keys you use; keys you leave go on to the editor (undo, Delete of its selection…).
- Text input: no prompt(); put an <input> on the page (position: fixed at the pointer), stop its keydown from propagating so typing
  stays in it, and save on Enter or blur.
- After saving, check what the trial put on the page (canvas_module_put's drawn) and look at it with view_screenshot.

## Example: reference lines anyone can draw, drag and delete, that walls snap to
    export default function (canvas) {
      const NS = 'http://www.w3.org/2000/svg';
      const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
      const zh = canvas.bridge.project().language !== 'en';
      const g = canvas.layer();
      const all = () => canvas.data.get()?.lines ?? [];
      const here = () => all().filter(l => l.level === canvas.bridge.level());
      const save = lines => canvas.data.set({ lines });
      let dragging = null; // id of the line being dragged

      function draw() {
        g.replaceChildren();
        for (const l of here()) {
          const line = el('line', { x1: l.a[0], y1: l.a[1], x2: l.b[0], y2: l.b[1], 'stroke-dasharray': '8 3 2 3', 'vector-effect': 'non-scaling-stroke', 'data-ref': l.id });
          const hit = el('line', { x1: l.a[0], y1: l.a[1], x2: l.b[0], y2: l.b[1], stroke: 'transparent', 'stroke-width': 12, 'vector-effect': 'non-scaling-stroke' });
          canvas.selectable(hit, 'ref:' + l.id);
          let from = null;
          canvas.draggable(hit, {
            snap: false,
            start(p) { from = p; dragging = l.id; },
            move(s) { const d = [s.point[0] - from[0], s.point[1] - from[1]]; for (const e of [line, hit]) e.setAttribute('transform', 'translate(' + d + ')'); },
            end(s) {
              dragging = null;
              if (!s) return;
              const d = [s.point[0] - from[0], s.point[1] - from[1]];
              save(all().map(x => (x.id === l.id ? { ...x, a: [x.a[0] + d[0], x.a[1] + d[1]], b: [x.b[0] + d[0], x.b[1] + d[1]] } : x)));
            },
          });
          g.append(line, hit);
        }
        restyle();
      }
      function restyle() {
        for (const line of g.querySelectorAll('[data-ref]')) {
          const on = canvas.isSelected('ref:' + line.getAttribute('data-ref'));
          line.setAttribute('stroke', on ? 'var(--canvas-selection)' : 'var(--chart-2)');
          line.setAttribute('stroke-width', on ? 2 : 1);
        }
      }

      // A tool: two clicks per line, snapped
      let first = null;
      const tool = {
        cursor: 'crosshair',
        down(p) {
          const q = canvas.snap(p, 10 * canvas.view.pxMm()).point;
          if (!first) { first = q; return true; }
          save([...all(), { id: Date.now().toString(36), level: canvas.bridge.level(), a: first, b: q }]);
          first = null;
          return true;
        },
        stop() { first = null; },
      };
      const b = canvas.button(zh ? '参考线' : 'Reference line', () => canvas.view.setTool(tool));
      canvas.view.onTool(t => b.setPressed(t === tool));

      // Delete removes the selected lines
      const onKey = e => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const keep = all().filter(l => !canvas.isSelected('ref:' + l.id));
        if (keep.length === all().length) return;
        e.preventDefault();
        save(keep);
      };
      document.addEventListener('keydown', onKey);

      canvas.addSnaps({ lines: () => here().filter(l => l.id !== dragging).map(l => [l.a, l.b]) });
      canvas.data.on(draw);
      canvas.view.onDraw(draw);
      canvas.onSelection(restyle);
      draw();
      return () => document.removeEventListener('keydown', onKey);
    }
`;
