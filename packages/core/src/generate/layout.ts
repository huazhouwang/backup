/**
 * Layouts (issue 187): a program placed as rectangles, storey by storey, before any wall exists. Coordinates are wall
 * centrelines in mm, x east and y south, the house's north-west corner at the origin. A typology decides where the bands and
 * wings go; rooms are then laid along each band in a preferred order, widths in proportion to their target areas.
 *
 * Typologies:
 * - `bar`: a corridor between a sunny south band (living room, bedrooms) and a north band (kitchen, baths, stair)
 * - `hall`: the living room as a central hall through the whole depth (一明两暗), a wing with its own corridor on each side
 * - `courtyard`: one storey around a courtyard (合院): main rooms in the north wing, the rest in east and west wings, verandas
 *   facing the courtyard and a wall with a gate closing its south side
 */
import { SLEEPING, SUNNY, type PlannedRoom, type Program, type RoomType } from './program.js';

export type Side = 'north' | 'south' | 'east' | 'west';
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a placed space is: a room from the program, or one the layout adds */
export type PlacedKind = RoomType | 'corridor' | 'stair' | 'veranda' | 'courtyard' | 'terrace';

export interface Placed {
  /** Unique within the layout */
  key: string;
  kind: PlacedKind;
  /** The program room it places */
  room?: PlannedRoom;
  floor: number;
  box: Box;
  /** The side it is entered from, and how (a swing door, or an open doorway) */
  access?: { side: Side; how: 'door' | 'opening' };
  /** The house's front door is in this room, on this side */
  entry?: Side;
}

export interface StairPlan {
  /** The stair room's box (the same on every storey) */
  box: Box;
  /** The flights' rectangle inside it, and how they climb */
  rect: [number, number, number, number];
  up: Side;
  turn: 'left' | 'right';
}

export interface Layout {
  typology: Typology;
  mirrored: boolean;
  width: number;
  depth: number;
  spaces: Placed[];
  stair?: StairPlan;
  /** Fence with a gate (courtyard): from, to, and where the gate is along it */
  fence?: { from: [number, number]; to: [number, number] };
}

export const TYPOLOGIES = ['bar', 'hall', 'courtyard'] as const;
export type Typology = (typeof TYPOLOGIES)[number];

const MODULE = 100;
const snap = (v: number) => Math.round(v / MODULE) * MODULE;
const CORRIDOR = 1350;
const VERANDA = 1500;
const STAIR_ROOM = { along: 4800, across: 2700 };

/** Where along a band a room prefers to be (0 west … 1 east); the order rooms are laid in */
const POSITION: Record<RoomType, number> = {
  bedroom: 0.08,
  kids: 0.12,
  elder: 0.28,
  tea: 0.34,
  shrine: 0.42,
  living: 0.5,
  family: 0.5,
  study: 0.7,
  master: 0.92,
  garage: 0.0,
  kitchen: 0.2,
  dining: 0.38,
  laundry: 0.62,
  storage: 0.66,
  bath: 0.8,
};
/** Rooms that may leave the sunny band when it is crowded, first to go first */
const MOVABLE_SOUTH: RoomType[] = ['study', 'tea', 'family', 'shrine', 'kids', 'bedroom'];
/** Rooms that may join the sunny band when the other one is crowded */
const MOVABLE_NORTH: RoomType[] = ['dining', 'storage', 'laundry'];

const m2 = (r: PlannedRoom) => r.area * 1e6;
const sum = (rs: PlannedRoom[]) => rs.reduce((a, r) => a + m2(r), 0);

/** Narrowest a room may be along its band (centreline mm): a bathroom you can turn round in, a bed across a bedroom */
const MIN_WIDTH: Partial<Record<RoomType, number>> = {
  bath: 1800,
  laundry: 1600,
  storage: 1500,
  kitchen: 2400,
  dining: 2700,
  study: 2400,
  bedroom: 3000,
  kids: 2800,
  elder: 3000,
  master: 3300,
  living: 3600,
  garage: 3300,
  tea: 2700,
  family: 3000,
  shrine: 2400,
};

/** The sum of rooms' minimum widths */
const minimum = (g: PlannedRoom[]) => g.reduce((t, r) => t + (MIN_WIDTH[r.type] ?? 1500), 0);

/**
 * Splits [a, b] among rooms in proportion to their areas, on the module grid, each at least its minimum width (taken from the
 * widest rooms); the last takes the rest
 */
function split(a: number, b: number, rooms: PlannedRoom[]): [number, number][] {
  const total = sum(rooms);
  const widths = rooms.map(r => ((b - a) * m2(r)) / total);
  for (let guard = 0; guard < 4; guard++) {
    const short = widths.map((w, i) => Math.max(0, (MIN_WIDTH[rooms[i].type] ?? 1500) - w));
    const lack = short.reduce((x, y) => x + y, 0);
    if (lack < 1) break;
    const spare = widths.map((w, i) => Math.max(0, w - (MIN_WIDTH[rooms[i].type] ?? 1500) - short[i]));
    const room = spare.reduce((x, y) => x + y, 0);
    if (room <= 0) break;
    const take = Math.min(1, lack / room);
    widths.forEach((w, i) => (widths[i] = w + short[i] - spare[i] * take));
  }
  const out: [number, number][] = [];
  let at = a;
  rooms.forEach((_, i) => {
    const end = i === rooms.length - 1 ? b : Math.min(b, snap(at + widths[i]));
    out.push([at, end]);
    at = end;
  });
  return out;
}

const byPosition = (mirrored: boolean) => (r1: PlannedRoom, r2: PlannedRoom) => pos(mirrored)(r1) - pos(mirrored)(r2);

/** Divides a floor's rooms between the sunny band and the other, so neither is much longer than the other */
function bands(rooms: PlannedRoom[], south: number, north: number, northFixed = 0) {
  const s = rooms.filter(r => SUNNY.has(r.type));
  const n = rooms.filter(r => !SUNNY.has(r.type));
  const len = () => ({ s: need(s, south), n: need(n, north, northFixed) });
  for (let guard = 0; guard < 6; guard++) {
    const l = len();
    if (l.s > l.n * 1.2) {
      const r = MOVABLE_SOUTH.map(t => s.find(x => x.type === t)).find(Boolean);
      // Only when it makes the two more even
      if (
        !r ||
        need(
          s.filter(x => x !== r),
          south,
        ) < need([...n, r], north, northFixed)
      )
        break;
      s.splice(s.indexOf(r), 1);
      n.push(r);
    } else if (l.n > l.s * 1.2) {
      const r = MOVABLE_NORTH.map(t => n.find(x => x.type === t)).find(Boolean);
      if (
        !r ||
        need([...s, r], south) >
          need(
            n.filter(x => x !== r),
            north,
            northFixed,
          )
      )
        break;
      n.splice(n.indexOf(r), 1);
      s.push(r);
    } else break;
  }
  return { s, n };
}

/** Depths of the two bands: deep enough for the biggest rooms to stay well proportioned */
function bandDepths(p: Program) {
  const sleeping = p.rooms.filter(r => SLEEPING.has(r.type) || r.type === 'living');
  const big = Math.max(...sleeping.map(r => r.area), 12);
  const south = snap(Math.min(5400, Math.max(3900, Math.sqrt(big * 1e6 * 0.8))));
  const north = snap(Math.max(p.floors > 1 ? STAIR_ROOM.across + 300 : 3000, Math.min(3600, south * 0.75)));
  return { south, north };
}

/** The width a band of this depth needs for these rooms, plus fixed lengths */
const need = (rooms: PlannedRoom[], depth: number, fixed = 0) => sum(rooms) / (depth * 0.92) + fixed;

function stairBox(x0: number, y0: number, depth: number, mirrored: boolean): StairPlan {
  const box = { x0, y0, x1: x0 + STAIR_ROOM.along, y1: y0 + depth };
  // Flights against the far end from the corridor's doorway; the first flight on the corridor side, climbing away from it
  const clear = 180;
  const across = Math.min(2400, depth - 2 * clear);
  const along = 3600;
  const ry = y0 + clear + (depth - 2 * clear - across);
  const up: Side = mirrored ? 'west' : 'east';
  const rx = mirrored ? box.x0 + clear : box.x1 - clear - along;
  return { box, rect: [rx, ry, along, across], up, turn: mirrored ? 'right' : 'left' };
}

const pos = (mirrored: boolean) => (r: PlannedRoom) => (mirrored ? 1 - POSITION[r.type] : POSITION[r.type]);
/** Where the stair sits in the north band's order (just east of the middle; west when mirrored) */
const STAIR_AT = 0.55;

/**
 * Lays rooms along [a, b] in a band from y0 to y1, entered from `side`. Much more length than the rooms need: the slack (up to
 * 3.6 m) becomes a room of its own at the end away from `keep` — a family room upstairs, storage downstairs — and the rooms
 * grow into the rest.
 */
function row(f: number, rooms: PlannedRoom[], a: number, b: number, y0: number, y1: number, side: Side, out: Placed[], keep: 'start' | 'end' = 'start') {
  const slack = b - a - need(rooms, y1 - y0) * 1.1;
  if (rooms.length && slack >= 3000) {
    const kind: PlacedKind = f > 0 ? 'family' : 'storage';
    // A family room takes all the slack; storage no more than a small room's worth
    const w = snap(kind === 'family' ? slack - 300 : Math.min(slack - 600, 3600));
    const box = keep === 'start' ? { x0: b - w, y0, x1: b, y1 } : { x0: a, y0, x1: a + w, y1 };
    out.push({ key: `f${f}-${kind}-${a}`, kind, floor: f, box, access: { side, how: kind === 'family' ? 'opening' : 'door' } });
    if (keep === 'start') b -= w;
    else a += w;
  }
  split(a, b, rooms).forEach(([x0, x1], i) =>
    out.push({
      key: `f${f}-${rooms[i].name}`,
      kind: rooms[i].type,
      room: rooms[i],
      floor: f,
      box: { x0, y0, x1, y1 },
      access: { side, how: rooms[i].type === 'dining' || rooms[i].type === 'living' || rooms[i].type === 'family' ? 'opening' : 'door' },
    }),
  );
}

/** A filler room where a band has length but no program room: storage */
function filler(f: number, key: string, box: Box, side: Side): Placed {
  return { key: `f${f}-${key}`, kind: 'storage', floor: f, box, access: { side, how: 'door' } };
}

/**
 * The north band of a floor around a stair at a fixed place: rooms west of it in their order, the rest east. A side too short
 * for its rooms hands them to the other; a side with length but no rooms gets storage.
 */
function northAround(f: number, n: PlannedRoom[], width: number, north: number, stair: StairPlan, mirrored: boolean, out: Placed[]) {
  const segs: [number, number][] = [
    [0, stair.box.x0],
    [stair.box.x1, width],
  ];
  const groups: PlannedRoom[][] = [[], []];
  for (const r of n) groups[pos(mirrored)(r) < STAIR_AT ? 0 : 1].push(r);
  for (let i = 0; i < 2; i++) {
    const len = segs[i][1] - segs[i][0];
    // Too short for what it holds (less than the rooms' minimum widths): move the rooms nearest the stair across
    while (groups[i].length && len < minimum(groups[i])) groups[1 - i][i === 0 ? 'unshift' : 'push'](i === 0 ? groups[i].pop()! : groups[i].shift()!);
  }
  segs.forEach(([a, b], i) => {
    if (b - a < 900) return;
    if (groups[i].length) row(f, groups[i], a, b, 0, north, 'south', out, i === 0 ? 'end' : 'start');
    else
      out.push({
        ...filler(f, `n-extra-${i}`, { x0: a, y0: 0, x1: b, y1: north }, 'south'),
        ...(f > 0 && b - a >= 3000 ? { kind: 'family' as PlacedKind, access: { side: 'south' as Side, how: 'opening' as const } } : {}),
      });
  });
  out.push({ key: `f${f}-stair`, kind: 'stair', floor: f, box: stair.box, access: { side: 'south', how: 'opening' } });
}

/**
 * Upper floors: a bar at the ground floor's width around the same stair. When their rooms need much less than that width, the
 * rest of the sunny band becomes a roof terrace (at the west end; east when mirrored) instead of oversized rooms.
 */
function upperFloors(p: Program, mirrored: boolean, width: number, depth: number, stair: StairPlan): Placed[] {
  const { south, north } = bandDepths(p);
  const out: Placed[] = [];
  const ys = { c0: north, c1: north + CORRIDOR };
  for (let f = 1; f < p.floors; f++) {
    const { s, n } = bands(
      p.rooms.filter(r => r.floor === f),
      south,
      north,
      STAIR_ROOM.along,
    );
    if (!s.length && n.length) s.push(n.shift()!);
    s.sort((a, b) => pos(mirrored)(a) - pos(mirrored)(b));
    n.sort((a, b) => pos(mirrored)(a) - pos(mirrored)(b));
    const used = Math.ceil(Math.max(need(s, south) * 1.1, width * 0.5) / 300) * 300;
    const terrace = width - used >= 3000 ? width - used : 0;
    const [ra, rb] = mirrored ? [0, width - terrace] : [terrace, width];
    row(f, s, ra, rb, ys.c1, depth, 'north', out);
    if (terrace)
      out.push({
        key: `f${f}-terrace`,
        kind: 'terrace',
        floor: f,
        box: mirrored ? { x0: width - terrace, y0: ys.c1, x1: width, y1: depth } : { x0: 0, y0: ys.c1, x1: terrace, y1: depth },
      });
    northAround(f, n, width, north, stair, mirrored, out);
    out.push({
      key: `f${f}-corridor`,
      kind: 'corridor',
      floor: f,
      box: { x0: 0, y0: ys.c0, x1: width, y1: ys.c1 },
      ...(terrace ? { access: { side: 'south' as Side, how: 'door' as const } } : {}),
    });
  }
  return out;
}

/** `bar`: north band, corridor, south band; the stair in the north band at the same place on every floor */
function bar(p: Program, mirrored: boolean): Layout {
  const { south, north } = bandDepths(p);
  const depth = north + CORRIDOR + south;
  const stairLen = p.floors > 1 ? STAIR_ROOM.along : 0;
  const { s, n } = bands(
    p.rooms.filter(r => r.floor === 0),
    south,
    north,
    stairLen,
  );
  s.sort((a, b) => pos(mirrored)(a) - pos(mirrored)(b));
  n.sort((a, b) => pos(mirrored)(a) - pos(mirrored)(b));
  const before = n.filter(r => pos(mirrored)(r) < STAIR_AT);
  const after = n.filter(r => !before.includes(r));
  // Wide enough for the rooms' areas and for their minimum widths, either side of the stair
  const width = Math.ceil(Math.max(need(s, south), need(n, north, stairLen), minimum(s), minimum(before) + stairLen + minimum(after), 7200) / 300) * 300;
  const spaces: Placed[] = [];
  const ys = { c0: north, c1: north + CORRIDOR };
  row(0, s, 0, width, ys.c1, depth, 'north', spaces);
  const living = spaces.find(x => x.kind === 'living');
  if (living) living.entry = 'south';
  let stair: StairPlan | undefined;
  if (stairLen) {
    // The stair goes where the order puts it: after the rooms that come before it, their share of the band's free length,
    // leaving each side at least its rooms' minimum widths
    const free = width - stairLen;
    const x = n.length ? snap((free * sum(before)) / sum(n)) : snap(free / 2);
    const lo = minimum(before),
      hi = free - minimum(after);
    stair = stairBox(Math.max(0, Math.min(free, Math.max(lo, Math.min(hi, x)))), 0, north, mirrored);
    northAround(0, n, width, north, stair, mirrored, spaces);
  } else row(0, n, 0, width, 0, north, 'south', spaces);
  spaces.push({ key: 'f0-corridor', kind: 'corridor', floor: 0, box: { x0: 0, y0: ys.c0, x1: width, y1: ys.c1 } });
  if (stair) spaces.push(...upperFloors(p, mirrored, width, depth, stair));
  return { typology: 'bar', mirrored, width, depth, spaces, stair };
}

/** `hall`: a central living hall through the whole depth on the ground floor, a wing either side; upper floors as `bar` */
function hall(p: Program, mirrored: boolean): Layout | null {
  const ground = p.rooms.filter(r => r.floor === 0);
  const living = ground.find(r => r.type === 'living');
  if (!living) return null;
  const { south, north } = bandDepths(p);
  const depth = north + CORRIDOR + south;
  const stairLen = p.floors > 1 ? STAIR_ROOM.along : 0;
  // The hall: as wide as the living room needs at full depth (at least 3.6 m)
  const hw = Math.max(3600, snap(m2(living) / (depth * 0.92)));
  const others = ground.filter(r => r !== living);
  // West wing (east when mirrored): rooms before the middle; the other wing has the stair, next to the hall
  const westRooms = others.filter(r => pos(mirrored)(r) < 0.5);
  const eastRooms = others.filter(r => pos(mirrored)(r) >= 0.5);
  const wingFor = (rooms: PlannedRoom[], fixed: number) => {
    const b = bands(rooms, south, north, fixed);
    if (!b.s.length && b.n.length > (fixed ? 0 : 1)) b.s.push(b.n.splice(b.n.length - 1, 1)[0]);
    if (!b.n.length && !fixed && b.s.length > 1) b.n.push(b.s.splice(0, 1)[0]);
    b.s.sort((a, c) => pos(mirrored)(a) - pos(mirrored)(c));
    b.n.sort((a, c) => pos(mirrored)(a) - pos(mirrored)(c));
    return { ...b, width: Math.ceil(Math.max(need(b.s, south), need(b.n, north, fixed), 3000) / 300) * 300 };
  };
  const first = wingFor(mirrored ? eastRooms : westRooms, 0);
  const second = wingFor(mirrored ? westRooms : eastRooms, stairLen);
  const width = first.width + hw + second.width;
  // In plan order, west to east
  const [wWing, eWing] = mirrored ? [second, first] : [first, second];
  const hx0 = wWing.width,
    hx1 = hx0 + hw;
  const ys = { c0: north, c1: north + CORRIDOR };
  const spaces: Placed[] = [{ key: `f0-${living.name}`, kind: 'living', room: living, floor: 0, box: { x0: hx0, y0: 0, x1: hx1, y1: depth }, entry: 'south' }];
  let stair: StairPlan | undefined;
  const wing = (w: typeof first, x0: number, x1: number, side: 'west' | 'east', withStair: boolean) => {
    let nx0 = x0,
      nx1 = x1;
    if (withStair) {
      // Against the hall
      stair = stairBox(side === 'east' ? x0 : x1 - STAIR_ROOM.along, 0, north, mirrored);
      spaces.push({ key: 'f0-stair', kind: 'stair', floor: 0, box: stair.box, access: { side: 'south', how: 'opening' } });
      if (side === 'east') nx0 = stair.box.x1;
      else nx1 = stair.box.x0;
    }
    if (w.s.length) row(0, w.s, x0, x1, ys.c1, depth, 'north', spaces);
    else spaces.push(filler(0, `${side}-s-extra`, { x0, y0: ys.c1, x1, y1: depth }, 'north'));
    if (nx1 - nx0 >= 900) {
      if (w.n.length) row(0, w.n, nx0, nx1, 0, north, 'south', spaces);
      else spaces.push(filler(0, `${side}-n-extra`, { x0: nx0, y0: 0, x1: nx1, y1: north }, 'south'));
    }
    // The wing's corridor opens into the hall
    spaces.push({
      key: `f0-corridor-${side}`,
      kind: 'corridor',
      floor: 0,
      box: { x0, y0: ys.c0, x1, y1: ys.c1 },
      access: { side: side === 'west' ? 'east' : 'west', how: 'opening' },
    });
  };
  wing(wWing, 0, hx0, 'west', !!stairLen && mirrored);
  wing(eWing, hx1, width, 'east', !!stairLen && !mirrored);
  if (stair) spaces.push(...upperFloors(p, mirrored, width, depth, stair));
  return { typology: 'hall', mirrored, width, depth, spaces, stair };
}

/** `courtyard`: one storey; north wing of sunny rooms, east and west wings for the rest, verandas around a courtyard */
function courtyard(p: Program, mirrored: boolean): Layout | null {
  if (p.floors > 1) return null;
  const rooms = [...p.rooms];
  const main = rooms.filter(r => SUNNY.has(r.type) && r.type !== 'tea').sort(byPosition(mirrored));
  const rest = rooms.filter(r => !main.includes(r)).sort(byPosition(mirrored));
  if (rest.length < 2) return null;
  const nd = snap(Math.min(5400, Math.max(4200, Math.sqrt(Math.max(...main.map(m2)) * 0.9))));
  const sd = 3900;
  const west = rest.filter((_, i) => i % 2 === 0);
  const east = rest.filter((_, i) => i % 2 === 1);
  const sideLen = Math.ceil(Math.max(need(west, sd), need(east, sd), 4200) / 300) * 300;
  let width = Math.ceil(Math.max(need(main, nd), 2 * (sd + VERANDA) + 4200) / 300) * 300;
  width = Math.max(width, 2 * sd + 2 * VERANDA + 3600);
  const depth = nd + VERANDA + sideLen;
  const spaces: Placed[] = [];
  split(0, width, main).forEach(([a, b], i) =>
    spaces.push({
      key: `f0-${main[i].name}`,
      kind: main[i].type,
      room: main[i],
      floor: 0,
      box: { x0: a, y0: 0, x1: b, y1: nd },
      access: { side: 'south', how: main[i].type === 'living' ? 'opening' : 'door' },
      ...(main[i].type === 'living' ? { entry: 'south' as Side } : {}),
    }),
  );
  // Side wings start below the north wing's veranda line, so their rooms don't touch the north rooms' windows
  const wingY0 = nd + VERANDA;
  const sideRooms = (x0: number, x1: number, rs: PlannedRoom[], toCourt: Side, key: string) =>
    split(wingY0, depth, rs.length ? rs : [{ type: 'storage', name: key, area: 6, floor: 0 }]).forEach(([a, b], i) =>
      spaces.push({
        key: `f0-${(rs[i] ?? { name: key }).name}`,
        kind: rs[i]?.type ?? 'storage',
        room: rs[i],
        floor: 0,
        box: { x0, y0: a, x1, y1: b },
        access: { side: toCourt, how: rs[i]?.type === 'dining' ? 'opening' : 'door' },
      }),
    );
  sideRooms(0, sd, west, 'east', 'west-extra');
  sideRooms(width - sd, width, east, 'west', 'east-extra');
  spaces.push({ key: 'f0-veranda-n', kind: 'veranda', floor: 0, box: { x0: 0, y0: nd, x1: width, y1: wingY0 } });
  spaces.push({ key: 'f0-veranda-w', kind: 'veranda', floor: 0, box: { x0: sd, y0: wingY0, x1: sd + VERANDA, y1: depth } });
  spaces.push({ key: 'f0-veranda-e', kind: 'veranda', floor: 0, box: { x0: width - sd - VERANDA, y0: wingY0, x1: width - sd, y1: depth } });
  spaces.push({ key: 'f0-courtyard', kind: 'courtyard', floor: 0, box: { x0: sd + VERANDA, y0: wingY0, x1: width - sd - VERANDA, y1: depth } });
  return { typology: 'courtyard', mirrored, width, depth, spaces, fence: { from: [sd, depth], to: [width - sd, depth] } };
}

/** Places a program in a typology; null when the typology doesn't suit it (e.g. a courtyard house of two storeys) */
export function layout(p: Program, typology: Typology, mirrored = false): Layout | null {
  if (typology === 'bar') return bar(p, mirrored);
  if (typology === 'hall') return hall(p, mirrored);
  return courtyard(p, mirrored);
}
