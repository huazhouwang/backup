/**
 * House generation (issue 187): a program → several candidate layouts (typologies, mirrored) → each built and checked with the
 * building rules → scored → the best 2–3 that differ meaningfully. Deterministic: the same program gives the same houses.
 */
import { areaReport } from '../geometry/area.js';
import { createProject } from '../model/factory.js';
import type { Project, ProjectLanguage } from '../model/schema.js';
import { checkRules } from '../rules/rules.js';
import { buildLayout } from './build.js';
import { TYPOLOGIES, layout, type Layout, type Typology } from './layout.js';
import { normalizeProgram, SLEEPING, type HouseProgram, type Program } from './program.js';

export * from './program.js';
export { TYPOLOGIES, layout as layoutHouse, type Typology, type Layout, type Placed } from './layout.js';
export { buildLayout } from './build.js';

export interface HouseOption {
  /** `bar`, `hall-mirrored`, …: what house_build takes */
  id: string;
  typology: Typology;
  mirrored: boolean;
  /** Footprint (m) and gross floor area (m², all storeys) */
  width: number;
  depth: number;
  gross: number;
  /** Each program room: target and built net area (m²) */
  rooms: { name: string; floor: number; target: number; area: number }[];
  /** Lower is better */
  score: number;
  /** Rule warnings left (errors rule an option out) */
  warnings: number;
  /** How far (m) it overruns the plot's buildable area, when no option fits inside it */
  overPlot?: { width: number; depth: number };
}

export const optionId = (t: Typology, mirrored: boolean) => (mirrored ? `${t}-mirrored` : t);
export function parseOptionId(id: string): { typology: Typology; mirrored: boolean } | null {
  const [t, m] = id.split('-');
  if (!(TYPOLOGIES as readonly string[]).includes(t) || (m && m !== 'mirrored')) return null;
  return { typology: t as Typology, mirrored: m === 'mirrored' };
}

/** A blank project with the program's storeys, ready for buildLayout */
function blank(program: Program, language: ProjectLanguage, name = 'house'): Project {
  return createProject({ id: 'generated', name, floors: program.floors, floorHeight: program.storeyHeight, language });
}

/** How well a built house serves its program: area misses, awkward rooms, a big footprint, rule warnings */
function score(p: Project, l: Layout, program: Program) {
  const report = areaReport(p);
  const net = new Map<string, number>();
  for (const lv of report.levels) for (const s of lv.spaces) net.set(`${lv.id}|${s.name}`, s.net);
  const storeys = p.levels.filter(x => !x.roof).sort((a, b) => a.elevation - b.elevation);
  let miss = 0;
  const rooms = program.rooms.map(r => {
    const area = net.get(`${storeys[r.floor]?.id}|${r.name}`) ?? 0;
    // Too small hurts; somewhat bigger than asked is fine in a home, much bigger is waste
    miss += area < r.area ? (r.area - area) / r.area : Math.max(0, area / r.area - 1.25) * 0.5;
    return { name: r.name, floor: r.floor, target: r.area, area: Math.round(area * 10) / 10 };
  });
  let shape = 0;
  let waste = 0;
  for (const s of l.spaces) {
    // Rooms the layout added to fill length: some are fine, a lot means the typology fits the program badly
    if (!s.room && (s.kind === 'storage' || s.kind === 'family')) waste += ((s.box.x1 - s.box.x0) * (s.box.y1 - s.box.y0)) / 1e6;
    if (!s.room) continue;
    const w = s.box.x1 - s.box.x0,
      d = s.box.y1 - s.box.y0;
    const ratio = Math.max(w, d) / Math.min(w, d);
    if (ratio > 2) shape += ratio - 2;
    if (SLEEPING.has(s.room.type) && Math.min(w, d) < 2900) shape += 1;
    if (Math.min(w, d) < 1400) shape += 2;
  }
  const gross = report.levels.reduce((a, lv) => a + lv.gross, 0);
  const wanted = program.rooms.reduce((a, r) => a + r.area, 0);
  const issues = checkRules(p);
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.length - errors;
  const value = miss / program.rooms.length + shape * 0.15 + Math.max(0, gross / wanted - 1.45) + Math.max(0, waste - 8) * 0.03 + warnings * 0.05;
  return { value, errors, warnings, rooms, gross: Math.round(gross) };
}

export interface Generated {
  program: Program;
  options: (HouseOption & { project: Project })[];
}

/**
 * Candidate houses for a program, best first: the best of each typology (mirrored or not), then — when fewer than `count`
 * typologies work — mirrored variants. Options with rule errors, or that don't fit the plot, are left out.
 */
export function houseOptions(input: HouseProgram, language: ProjectLanguage, count = 3): Generated {
  const program = normalizeProgram(input, language);
  const all: (HouseOption & { project: Project })[] = [];
  for (const t of TYPOLOGIES)
    for (const mirrored of [false, true]) {
      const l = layout(program, t, mirrored);
      if (!l) continue;
      const over = program.plot && { width: Math.max(0, l.width - program.plot.width) / 1000, depth: Math.max(0, l.depth - program.plot.depth) / 1000 };
      const p = blank(program, language);
      buildLayout(p, l);
      const s = score(p, l, program);
      if (s.errors) continue;
      all.push({
        id: optionId(t, mirrored),
        typology: t,
        mirrored,
        width: l.width / 1000,
        depth: l.depth / 1000,
        gross: s.gross,
        rooms: s.rooms,
        score: Math.round(s.value * 1000) / 1000,
        warnings: s.warnings,
        ...(over && (over.width || over.depth) ? { overPlot: over } : {}),
        project: p,
      });
    }
  // Houses that fit the plot; when none does, the ones that overrun it least, saying by how much (never nothing to choose from)
  const fits = all.filter(o => !o.overPlot);
  const overrun = (o: (typeof all)[number]) => (o.overPlot ? o.overPlot.width + o.overPlot.depth : 0);
  if (fits.length) all.splice(0, all.length, ...fits);
  else all.sort((a, b) => overrun(a) - overrun(b) || a.score - b.score).splice(count);
  all.sort((a, b) => a.score - b.score);
  const picked: typeof all = [];
  for (const o of all) if (picked.length < count && !picked.some(x => x.typology === o.typology)) picked.push(o);
  for (const o of all) if (picked.length < count && !picked.includes(o)) picked.push(o);
  return { program, options: picked };
}

/**
 * Replaces a design's building with a generated house: its storeys, walls, spaces, stairs and furniture (site, library, brief,
 * decisions and widgets stay). Writes into the project it is given.
 */
export function buildHouse(p: Project, input: HouseProgram, id: string) {
  const program = normalizeProgram(input, p.language);
  const parsed = parseOptionId(id);
  if (!parsed) throw new Error(`unknown house option ${id}`);
  const l = layout(program, parsed.typology, parsed.mirrored);
  if (!l) throw new Error(`option ${id} does not suit this program`);
  const fresh = blank(program, p.language, p.name);
  p.levels = fresh.levels;
  p.walls = [];
  p.spaces = [];
  p.elements = [];
  p.furniture = [];
  p.constraints = [];
  buildLayout(p, l);
  return { program, layout: l };
}
