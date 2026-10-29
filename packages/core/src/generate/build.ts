/**
 * Builds a layout into a design (issue 187): spaces from its boxes; walls wherever an indoor space meets something else
 * (bearing outside, partitions inside); doors where each room is entered, the front door, windows on outside walls; stairs
 * with their slab openings; and furniture for each room. Writes into the project it is given (a draft inside a transaction).
 */
import { addOpening, addSpace, addWall, renameWalls } from '../capabilities/edit-helpers.js';
import { elementGeometry } from '../geometry/elements.js';
import { rect, wallLength } from '../geometry/geometry.js';
import { nextId, uniqueName } from '../geometry/topology.js';
import { NAME_SEPARATOR, names } from '../model/names.js';
import { roomRole } from '../model/roles.js';
import { DEFAULT_STYLE_ID, stylePreset } from '../render/styles.js';
import type { Element, Furniture, Opening, Project, Space, Wall } from '../model/schema.js';
import type { Box, Layout, Placed, PlacedKind, Side } from './layout.js';
import { EXTRA_NAMES, ROOM_TYPES, roomTypeName, SLEEPING, type RoomType } from './program.js';

/** Margin around the house on its site (mm): more in front (south) for a yard */
const MARGIN = { north: 3000, south: 6000, side: 3000 };
const EXTERIOR = 240;
const PARTITION = 120;

/** The design language a house is finished in (issue 217): the first style the owner picked that is one, else the default */
function finishesOf(p: Project) {
  const style = p.brief.style?.map(stylePreset).find(Boolean) ?? stylePreset(DEFAULT_STYLE_ID)!;
  p.extras = { ...p.extras, style: style.id };
  return style.finishes;
}

const INDOOR = (k: PlacedKind) => k !== 'veranda' && k !== 'courtyard' && k !== 'terrace';

interface Ctx {
  p: Project;
  layout: Layout;
  ox: number;
  oy: number;
  level: (f: number) => string;
  /** Spaces made for each placed box */
  made: Map<string, Space>;
}

const at = (c: Ctx, b: Box): Box => ({ x0: b.x0 + c.ox, y0: b.y0 + c.oy, x1: b.x1 + c.ox, y1: b.y1 + c.oy });

/** Which placed box (on a floor) contains a point, indoor ones first */
function boxAt(spaces: Placed[], x: number, y: number): Placed | undefined {
  const inside = spaces.filter(s => x > s.box.x0 && x < s.box.x1 && y > s.box.y0 && y < s.box.y1);
  return inside.find(s => INDOOR(s.kind)) ?? inside[0];
}

/**
 * Walls of one floor: every box edge is cut at every corner on its line; a piece between two different indoor spaces is a
 * partition, between indoor and anything else a bearing exterior wall, otherwise nothing. Neighbouring pieces with the same two
 * sides are joined.
 */
function buildWalls(c: Ctx, f: number) {
  const spaces = c.layout.spaces.filter(s => s.floor === f);
  const lines = new Map<string, { horizontal: boolean; at: number; cuts: Set<number> }>();
  const line = (horizontal: boolean, v: number) => {
    const k = `${horizontal ? 'h' : 'v'}${v}`;
    if (!lines.has(k)) lines.set(k, { horizontal, at: v, cuts: new Set() });
    return lines.get(k)!;
  };
  for (const s of spaces) {
    const { x0, y0, x1, y1 } = s.box;
    for (const y of [y0, y1]) [x0, x1].forEach(x => line(true, y).cuts.add(x));
    for (const x of [x0, x1]) [y0, y1].forEach(y => line(false, x).cuts.add(y));
  }
  // Every corner cuts every line through it
  for (const s of spaces)
    for (const [x, y] of [
      [s.box.x0, s.box.y0],
      [s.box.x1, s.box.y1],
    ]) {
      for (const l of lines.values()) if (l.horizontal && l.at === y) l.cuts.add(x);
      for (const l of lines.values()) if (!l.horizontal && l.at === x) l.cuts.add(y);
    }
  for (const l of lines.values()) {
    const cuts = [...l.cuts].sort((a, b) => a - b);
    let run: { a: number; b: number; key: string; kind: Wall['kind']; outside: boolean } | null = null;
    const flush = () => {
      if (!run) return;
      const start: [number, number] = l.horizontal ? [run.a + c.ox, l.at + c.oy] : [l.at + c.ox, run.a + c.oy];
      const end: [number, number] = l.horizontal ? [run.b + c.ox, l.at + c.oy] : [l.at + c.ox, run.b + c.oy];
      const thickness = run.kind === 'bearing' || (run.kind === 'partition' && run.outside) ? EXTERIOR : run.kind === 'parapet' ? PARTITION : PARTITION;
      addWall(c.p, c.level(f), start, end, { kind: run.kind, thickness, ...(run.kind === 'parapet' ? { height: 1100 } : {}) });
      run = null;
    };
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i],
        b = cuts[i + 1],
        m = (a + b) / 2;
      const one = l.horizontal ? boxAt(spaces, m, l.at - 1) : boxAt(spaces, l.at - 1, m);
      const two = l.horizontal ? boxAt(spaces, m, l.at + 1) : boxAt(spaces, l.at + 1, m);
      const in1 = one && INDOOR(one.kind),
        in2 = two && INDOOR(two.kind);
      const terrace = one?.kind === 'terrace' || two?.kind === 'terrace';
      // Indoor beside a terrace: a wall on the slab, not structure; a terrace's open edge: a parapet
      const kind: Wall['kind'] | null =
        in1 && in2 ? (one !== two ? 'partition' : null) : in1 || in2 ? (terrace ? 'partition' : 'bearing') : terrace && !(one && two) ? 'parapet' : null;
      const key = `${one?.key}|${two?.key}`;
      if (!kind) {
        flush();
        continue;
      }
      if (run && run.key === key && run.kind === kind && run.b === a) run.b = b;
      else {
        flush();
        run = { a, b, key, kind, outside: terrace };
      }
    }
    flush();
  }
}

/** Walls of a floor along one side of a box, with the part of each that the box covers (mm from the wall's start) */
function wallsOnSide(c: Ctx, f: number, b: Box, side: Side) {
  const g = at(c, b);
  const horizontal = side === 'north' || side === 'south';
  const v = side === 'north' ? g.y0 : side === 'south' ? g.y1 : side === 'west' ? g.x0 : g.x1;
  const [lo, hi] = horizontal ? [g.x0, g.x1] : [g.y0, g.y1];
  const out: { wall: Wall; from: number; to: number }[] = [];
  for (const w of c.p.walls) {
    if (w.level !== c.level(f) || w.kind === 'fence') continue;
    const wh = w.start[1] === w.end[1];
    if (wh !== horizontal) continue;
    if ((horizontal ? w.start[1] : w.start[0]) !== v) continue;
    const s = horizontal ? w.start[0] : w.start[1],
      e = horizontal ? w.end[0] : w.end[1];
    const a = Math.max(lo, Math.min(s, e)),
      z = Math.min(hi, Math.max(s, e));
    if (z - a < 300) continue;
    // Along the wall from its start
    const from = Math.abs(a - s),
      to = Math.abs(z - s);
    out.push({ wall: w, from: Math.min(from, to), to: Math.max(from, to) });
  }
  return out.sort((x, y) => y.to - y.from - (x.to - x.from));
}

/** True when an opening of this width fits at this spot without touching the wall's ends or its other openings */
function fits(w: Wall, centre: number, width: number) {
  const L = wallLength(w);
  const end = w.kind === 'bearing' ? 250 : 150;
  if (centre - width / 2 < end || centre + width / 2 > L - end) return false;
  return w.openings.every(o => Math.abs(o.at - centre) >= (o.width + width) / 2 + 250);
}

function place(c: Ctx, w: Wall, kind: Opening['kind'], centre: number, o: { width: number; height?: number; sill?: number }) {
  if (!fits(w, centre, o.width)) return null;
  return addOpening(c.p, w, kind, { at: centre, ...o });
}

/** Window sizes by room: wide on the sunny side, small and high in bathrooms */
function windowFor(kind: PlacedKind, side: Side, length: number) {
  if (kind === 'bath' || kind === 'laundry') return { width: 600, height: 900, sill: 1500 };
  if (kind === 'stair' || kind === 'corridor' || kind === 'storage') return { width: 900, height: 1200, sill: 1200 };
  if (kind === 'kitchen') return { width: Math.min(1500, length - 700), height: 1200, sill: 1050 };
  const wide = side === 'south' ? 0.6 : 0.45;
  return { width: Math.max(900, Math.min(side === 'south' ? 2400 : 1800, Math.round((length * wide) / 100) * 100)), height: 1500, sill: 900 };
}

function openings(c: Ctx) {
  const center = { x: c.layout.width / 2 + c.ox, y: c.layout.depth / 2 + c.oy };
  for (const s of c.layout.spaces) {
    if (!INDOOR(s.kind)) continue;
    const f = s.floor;
    // Where it is entered from: the longest wall on that side shared with its neighbour
    if (s.access) {
      const cand = wallsOnSide(c, f, s.box, s.access.side);
      const best = cand[0];
      if (best) {
        const len = best.to - best.from;
        if (s.access.how === 'opening') {
          const width = Math.min(len - 400, s.kind === 'stair' ? 1200 : s.kind === 'corridor' ? 1200 : s.kind === 'living' ? 2400 : 1800);
          const centre =
            s.kind === 'stair' && c.layout.stair
              ? // The stair's doorway at the end its first flight starts from
                c.layout.stair.up === 'east'
                ? best.from + width / 2 + 200
                : best.to - width / 2 - 200
              : (best.from + best.to) / 2;
          if (width >= 800) place(c, best.wall, 'opening', centre, { width, height: 2400 });
        } else {
          if (s.kind === 'corridor') {
            place(c, best.wall, 'sliding-door', (best.from + best.to) / 2, { width: Math.min(2400, len - 600) });
            continue;
          }
          const width = s.kind === 'bath' ? 800 : 900;
          // Near the end toward the middle of the house, leaving the rest of the wall for furniture
          const w = best.wall;
          const horizontal = w.start[1] === w.end[1];
          const startCoord = horizontal ? w.start[0] : w.start[1];
          const endCoord = horizontal ? w.end[0] : w.end[1];
          const mid = horizontal ? center.x : center.y;
          const nearStart =
            Math.abs(startCoord + Math.sign(endCoord - startCoord) * best.from - mid) < Math.abs(startCoord + Math.sign(endCoord - startCoord) * best.to - mid);
          const centre = nearStart ? best.from + width / 2 + 350 : best.to - width / 2 - 350;
          const op = place(c, w, 'door', centre, { width }) ?? place(c, w, 'door', (best.from + best.to) / 2, { width });
          if (op) op.swing = { hinge: nearStart ? 'start' : 'end', side: doorSide(w, s, c) };
        }
      }
    }
    // The front door, with windows either side when there is room
    if (s.entry) {
      const best = wallsOnSide(c, f, s.box, s.entry)[0];
      if (best) {
        const mid = (best.from + best.to) / 2;
        place(c, best.wall, 'door', mid, { width: 1500, height: 2400 });
        const len = best.to - best.from;
        if (len >= 5400) for (const d of [-1, 1]) place(c, best.wall, 'window', mid + (d * len) / 3.2, { width: 1500, height: 1600, sill: 800 });
      }
    }
    // Windows on outside walls, one per side (a garage gets its gate instead, on its longest outside wall)
    let gate = s.kind === 'garage';
    for (const side of ['south', 'north', 'east', 'west'] as Side[]) {
      if (side === s.entry) continue;
      for (const { wall, from, to } of wallsOnSide(c, f, s.box, side)) {
        if (wall.kind !== 'bearing' && wall.thickness !== EXTERIOR) continue;
        const len = to - from;
        if (gate && len >= 3300) {
          place(c, wall, 'gate', (from + to) / 2, { width: 2700, height: 2400 });
          gate = false;
          continue;
        }
        if (len < 1300) continue;
        const win = windowFor(s.kind, side, len);
        place(c, wall, 'window', (from + to) / 2, win);
        break;
      }
    }
  }
}

/** The side of the wall (looking from start to end) a door swings to: into the room it serves */
function doorSide(w: Wall, s: Placed, c: Ctx): 'left' | 'right' {
  const b = at(c, s.box);
  const cx = (b.x0 + b.x1) / 2,
    cy = (b.y0 + b.y1) / 2;
  const dx = w.end[0] - w.start[0],
    dy = w.end[1] - w.start[1];
  // Left of travel (x east, y south, plan north up) is (dy, -dx)
  const left = dy * (cx - w.start[0]) - dx * (cy - w.start[1]);
  return left > 0 ? 'left' : 'right';
}

function stairs(c: Ctx) {
  const st = c.layout.stair;
  if (!st) return;
  const vocab = names(c.p);
  const floors = Math.max(...c.layout.spaces.map(s => s.floor)) + 1;
  c.p.library.elements.stair ??= { name: c.p.language === 'zh' ? '两跑楼梯' : 'U-shaped stair', version: 1 };
  for (let f = 0; f < floors - 1; f++) {
    const [x, y, w, h] = st.rect;
    const e: Element = {
      id: nextId(c.p, 'e-stair'),
      name: `${c.p.language === 'zh' ? '楼梯' : 'Stair'}${NAME_SEPARATOR}${c.p.levels.find(l => l.id === c.level(f))!.name}`,
      type: 'stair',
      level: c.level(f),
      topLevel: c.level(f + 1),
      params: { rect: [x + c.ox, y + c.oy, w, h], up: st.up, turn: st.turn, gap: 100 },
    };
    c.p.elements.push(e);
    const g = elementGeometry(c.p, e);
    const room = c.made.get(`f${f + 1}-stair`);
    if (g.opening && room)
      c.p.spaces.push({
        id: nextId(c.p, `${room.id}-void`),
        name: vocab.stairOpening,
        level: c.level(f + 1),
        kind: 'void',
        shape: [{ outer: g.opening.ring }],
        floor: room.floor,
      });
  }
}

// --- Furniture ---------------------------------------------------------------------------------------------------------

/** Rotation that puts a piece's back against a wall on this side (front faces south at 0°, clockwise) */
const BACK: Record<Side, number> = { north: 0, east: 90, south: 180, west: 270 };
/** Clear inside of a box: centreline box minus half the thickest wall, and a little air */
const CLEAR = 150;

interface Piece {
  type: string;
  x: number;
  y: number;
  rot: number;
  size?: { w: number; d: number; h: number };
  /** Other places for it, tried in order when this one is in a door's way */
  alts?: Piece[];
  /** Whole arrangements instead of one piece: the first one that is entirely clear is placed */
  set?: Piece[][];
}

/** A piece with its back against `side` of the clear box, `t` (0–1) along that side */
function against(b: Box, side: Side, t: number, w: number, d: number, type: string): Piece {
  const horizontal = side === 'north' || side === 'south';
  const len = horizontal ? b.x1 - b.x0 : b.y1 - b.y0;
  return againstAt(b, side, w / 2 + (len - w) * t, d, type);
}

/** A piece with its back against `side` of the clear box, its centre `along` mm from the side's west / north end */
function againstAt(b: Box, side: Side, along0: number, d: number, type: string): Piece {
  const horizontal = side === 'north' || side === 'south';
  const along = (horizontal ? b.x0 : b.y0) + along0;
  const off = d / 2;
  const pos = side === 'north' ? [along, b.y0 + off] : side === 'south' ? [along, b.y1 - off] : side === 'west' ? [b.x0 + off, along] : [b.x1 - off, along];
  return { type, x: pos[0], y: pos[1], rot: BACK[side] };
}

const OPPOSITE: Record<Side, Side> = { north: 'south', south: 'north', east: 'west', west: 'east' };

/** Furniture for a room by its kind, kept clear of the side it is entered from */
function furnish(kind: PlacedKind, box: Box, access: Side | undefined, entry: Side | undefined): Piece[] {
  const b = { x0: box.x0 + CLEAR, y0: box.y0 + CLEAR, x1: box.x1 - CLEAR, y1: box.y1 - CLEAR };
  const W = b.x1 - b.x0,
    D = b.y1 - b.y0;
  const door = access ?? 'north';
  const far = OPPOSITE[door];
  // The two sides across the room from left to right, as seen from the door
  const sides: Side[] = door === 'north' || door === 'south' ? ['west', 'east'] : ['north', 'south'];
  const span = (s: Side) => (s === 'north' || s === 'south' ? W : D);
  const depthFrom = (s: Side) => (s === 'north' || s === 'south' ? D : W);
  const out: Piece[] = [];
  if (SLEEPING.has(kind as never)) {
    const bedW = kind === 'master' ? 1800 : kind === 'kids' ? 1200 : 1500;
    // Headboard against a side wall when the room is wide enough, else against the far wall
    const side = depthFrom(sides[0]) >= 2000 + 900 && span(sides[0]) >= bedW + 1100 ? sides[1] : far;
    const along = span(side);
    if (depthFrom(side) < 2000 + 600 || along < bedW) return out;
    out.push({ ...againstAt(b, side, along / 2, 2000, 'bed'), size: { w: bedW, d: 2000, h: 450 } });
    // Nightstands either side of the bed, when there is room
    if ((along - bedW) / 2 >= 600) for (const k of [-1, 1]) out.push({ ...againstAt(b, side, along / 2 + k * (bedW / 2 + 300), 400, 'nightstand'), alts: [] });
    // Wardrobe on the wall facing the headboard, if the room is long enough
    const opp = OPPOSITE[side];
    if (depthFrom(side) >= 2000 + 900 + 600 && span(opp) >= 1700)
      out.push({
        ...against(b, opp, 0, 1600, 600, 'wardrobe'),
        alts: [against(b, opp, 1, 1600, 600, 'wardrobe'), against(b, far, 0.5, 1600, 600, 'wardrobe')],
      });
    return out;
  }
  switch (kind) {
    case 'living':
    case 'family': {
      // Sofa against a wall, the TV opposite, a coffee table between; tried on each wall and at several places along it
      const sets: Piece[][] = [];
      for (const s of [...sides, far, door])
        for (const t of [0.5, 0.75, 0.25]) {
          if (depthFrom(s) < 3300 || span(s) < 2400) continue;
          const sofa = against(b, s, t, 2100, 900, 'sofa');
          const tv = against(b, OPPOSITE[s], t, 1800, 400, 'tvstand');
          const horizontal = s === 'north' || s === 'south';
          const dir = s === 'west' || s === 'north' ? 1 : -1;
          const off = 450 + 300 + 300;
          sets.push([sofa, tv, { type: 'coffee', x: horizontal ? sofa.x : sofa.x + dir * off, y: horizontal ? sofa.y + dir * off : sofa.y, rot: sofa.rot }]);
        }
      void entry;
      if (sets.length) out.push({ ...sets[0][0], set: sets });
      return out;
    }
    case 'dining': {
      if (W < 2600 || D < 2600) return out;
      const long = W >= D;
      const cx = (b.x0 + b.x1) / 2,
        cy = (b.y0 + b.y1) / 2;
      out.push({ type: 'dining', x: cx, y: cy, rot: long ? 0 : 90 });
      for (const k of [-1, 1])
        for (const d of [-1, 1]) {
          const a = k * 400,
            n = d * (450 + 300);
          out.push({ type: 'chair', x: long ? cx + a : cx + n, y: long ? cy + n : cy + a, rot: long ? (d < 0 ? 0 : 180) : d < 0 ? 270 : 90 });
        }
      return out;
    }
    case 'kitchen': {
      const s = far;
      if (span(s) < 2600 || depthFrom(s) < 1800) return out;
      const cw = Math.min(2400, span(s) - 800);
      out.push({ ...against(b, s, 0, cw, 600, 'counter'), size: { w: cw, d: 600, h: 850 } });
      out.push(against(b, s, 1, 700, 700, 'fridge'));
      return out;
    }
    case 'bath': {
      if (W < 1300 || D < 1300) return out;
      const s = far;
      out.push(against(b, s, 0, 400, 700, 'toilet'));
      if (span(s) >= 1800) out.push(against(b, s, 1, 600, 450, 'basin'));
      if (depthFrom(sides[1]) >= 900 && span(sides[1]) >= 2200)
        out.push({
          ...against(b, sides[1], 1, 900, 900, 'shower'),
          alts: [against(b, sides[0], 1, 900, 900, 'shower'), against(b, sides[1], 0, 900, 900, 'shower')],
        });
      return out;
    }
    case 'laundry': {
      if (span(far) < 1400) return out;
      out.push(against(b, far, 0, 600, 600, 'washer'));
      out.push(against(b, far, 1, 600, 500, 'sink'));
      return out;
    }
    case 'study': {
      if (span(far) < 1400 || depthFrom(far) < 1800) return out;
      out.push(against(b, far, 0.5, 1200, 600, 'desk'));
      if (span(sides[0]) >= 1400) out.push(against(b, sides[0], 0.5, 1200, 350, 'bookcase'));
      return out;
    }
    case 'tea': {
      if (W < 2400 || D < 2400) return out;
      out.push({ type: 'teatable', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, rot: 0 });
      return out;
    }
    case 'shrine': {
      if (span(far) < 2200) return out;
      out.push(against(b, far, 0.5, 2000, 500, 'shrine'));
      return out;
    }
    case 'garage': {
      if (Math.max(W, D) < 5400 || Math.min(W, D) < 2400) return out;
      // Toward the far side, clear of the door
      const car = { type: 'car', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, rot: W >= D ? 0 : 90 };
      const shift = Math.max(0, (W >= D ? D : W) - 2000) / 2;
      const away: Record<Side, [number, number]> = { north: [0, shift], south: [0, -shift], west: [shift, 0], east: [-shift, 0] };
      const [dx, dy] = away[door];
      out.push({ ...car, x: car.x + dx, y: car.y + dy });
      return out;
    }
    default:
      return out;
  }
}

/** Squares in front of each door of a room, on the room's side: where its leaf swings */
function swingZones(c: Ctx, s: Placed): Box[] {
  const g = at(c, s.box);
  const zones: Box[] = [];
  for (const w of c.p.walls) {
    if (w.level !== c.level(s.floor)) continue;
    for (const o of w.openings) {
      if (o.kind !== 'door' && o.kind !== 'sliding-door' && o.kind !== 'gate' && o.kind !== 'opening') continue;
      const L = wallLength(w);
      const ux = (w.end[0] - w.start[0]) / L,
        uy = (w.end[1] - w.start[1]) / L;
      const cx = w.start[0] + ux * o.at,
        cy = w.start[1] + uy * o.at;
      // Only doors on this room's edge
      if (cx < g.x0 - 1 || cx > g.x1 + 1 || cy < g.y0 - 1 || cy > g.y1 + 1) continue;
      const onEdge = Math.abs(cx - g.x0) < 1 || Math.abs(cx - g.x1) < 1 || Math.abs(cy - g.y0) < 1 || Math.abs(cy - g.y1) < 1;
      if (!onEdge) continue;
      const half = o.width / 2 + 100;
      const reach = Math.min(o.width, 1200) + 300;
      if (Math.abs(uy) < 0.5) {
        // Horizontal wall: the zone reaches into the room, north or south of it
        const into = Math.abs(cy - g.y0) < 1 ? 1 : -1;
        zones.push({ x0: cx - half, x1: cx + half, y0: Math.min(cy, cy + into * reach), y1: Math.max(cy, cy + into * reach) });
      } else {
        const into = Math.abs(cx - g.x0) < 1 ? 1 : -1;
        zones.push({ y0: cy - half, y1: cy + half, x0: Math.min(cx, cx + into * reach), x1: Math.max(cx, cx + into * reach) });
      }
    }
  }
  return zones;
}

/** A piece's footprint as a box (pieces are only ever turned by right angles) */
function footprint(piece: Piece, size: { w: number; d: number }): Box {
  const turned = piece.rot % 180 !== 0;
  const w = turned ? size.d : size.w,
    d = turned ? size.w : size.d;
  return { x0: piece.x - w / 2, x1: piece.x + w / 2, y0: piece.y - d / 2, y1: piece.y + d / 2 };
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function furniture(c: Ctx) {
  for (const s of c.layout.spaces) {
    const space = c.made.get(s.key);
    if (!space || !INDOOR(s.kind)) continue;
    const zones = swingZones(c, s);
    const taken: Box[] = [];
    const clear = (q: Piece) => {
      const d = c.p.library.furniture[q.type];
      if (!d) return false;
      const fp = footprint(q, q.size ?? d.size);
      return !zones.some(z => overlaps(z, fp)) && !taken.some(t => overlaps(t, fp));
    };
    // The first place (or arrangement) clear of every door's swing and of what is already there; none clear: left out
    const chosen: Piece[] = [];
    for (const first of furnish(s.kind, at(c, s.box), s.access?.side, s.entry)) {
      const pick = first.set ? first.set.find(set => set.every(clear)) : [[first, ...(first.alts ?? [])].find(clear)].filter(Boolean);
      for (const q of (pick ?? []) as Piece[]) {
        chosen.push(q);
        const d = c.p.library.furniture[q.type]!;
        taken.push(footprint(q, q.size ?? d.size));
      }
    }
    for (const piece of chosen) {
      const def = c.p.library.furniture[piece.type];
      if (!def) continue;
      const size = piece.size ?? def.size;
      const level = c.level(s.floor);
      const f: Furniture = {
        id: nextId(c.p, `${level}-f`),
        name: uniqueName(
          c.p.furniture.filter(x => x.level === level).map(x => x.name),
          `${space.name}${NAME_SEPARATOR}${def.name}`,
          c.p.language,
        ),
        type: piece.type,
        level,
        position: [Math.round(piece.x), Math.round(piece.y)],
        rotation: piece.rot,
        size: { ...size },
      };
      c.p.furniture.push(f);
    }
  }
}

/** Writes a layout into a project whose levels already stack (one per storey, then the roof) and that is otherwise empty */
export function buildLayout(p: Project, layout: Layout) {
  const finishes = finishesOf(p);
  const storeys = [...p.levels].filter(l => !l.roof).sort((a, b) => a.elevation - b.elevation);
  const c: Ctx = { p, layout, ox: MARGIN.side, oy: MARGIN.north, level: f => storeys[f].id, made: new Map() };
  const W = layout.width + 2 * MARGIN.side,
    D = layout.depth + MARGIN.north + MARGIN.south;
  p.site.boundary = rect(0, 0, W, D).outer;
  const extra = EXTRA_NAMES[p.language];
  for (const s of layout.spaces) {
    const name =
      s.room?.name ??
      (s.kind === 'courtyard'
        ? extra.courtyard
        : s.kind === 'veranda'
          ? extra.veranda
          : s.kind === 'stair'
            ? extra.stair
            : s.kind === 'corridor'
              ? extra.corridor
              : s.kind === 'terrace'
                ? extra.terrace
                : extraName(p, s.kind));
    const kind: Space['kind'] = s.kind === 'courtyard' ? 'outdoor' : s.kind === 'veranda' ? 'semi-outdoor' : s.kind === 'terrace' ? 'roof-terrace' : 'indoor';
    const g = at(c, s.box);
    const sp = addSpace(p, c.level(s.floor), name, [rect(g.x0, g.y0, g.x1, g.y1)], kind, finishes.floors.hall);
    // What the room is for, recorded, and its floor in the design language
    sp.extras = { ...sp.extras, room: s.kind };
    sp.floor = finishes.floors[roomRole(sp)];
    c.made.set(s.key, sp);
  }
  const floors = Math.max(...layout.spaces.map(s => s.floor)) + 1;
  for (let f = 0; f < floors; f++) buildWalls(c, f);
  if (layout.fence) {
    const w = addWall(p, c.level(0), [layout.fence.from[0] + c.ox, layout.fence.from[1] + c.oy], [layout.fence.to[0] + c.ox, layout.fence.to[1] + c.oy], {
      kind: 'fence',
      height: 1800,
    });
    addOpening(p, w, 'gate', { width: 1800, height: 2200 });
  }
  openings(c);
  stairs(c);
  furniture(c);
  for (const w of p.walls) if (w.kind !== 'railing') w.finish = finishes.walls;
  for (let f = 0; f < floors; f++) renameWalls(p, c.level(f));
  return c.made;
}

/** Names for rooms a layout adds to fill space (storage, a family room) */
function extraName(p: Project, kind: PlacedKind) {
  return (ROOM_TYPES as readonly string[]).includes(kind) ? roomTypeName(kind as RoomType, p.language) : String(kind);
}
