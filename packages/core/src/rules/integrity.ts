/**
 * Physical integrity, the way BIM tools keep a model buildable: walls attached to their storey don't rise through the slab above,
 * openings stay inside their host wall, furniture fits under the ceiling (a floor above, or a room's roof). Each is an error: the transaction pipeline rolls back a
 * change that introduces one, and tells the caller why.
 */
import { pointAt, pointInPolygon, wallLength } from '../geometry/geometry.js';
import { wallHeight } from '../geometry/mesh.js';
import { roofs } from '../geometry/roofs.js';
import { text } from '../i18n.js';
import { levelAbove, SLAB_THICKNESS } from '../model/levels.js';
import type { Id, Point, Project, Wall } from '../model/schema.js';
import type { Issue } from './rules.js';

/** Wall kinds attached to their storey (BIM's standard walls); fences, parapets and railings stand free at their own height */
const STOREY_WALLS = new Set<Wall['kind']>(['bearing', 'partition']);

/** Whether the level above this one has a floor slab over this point (a slab opening, a void or no level above has none) */
function slabAbove(p: Project, level: Id, at: Point) {
  const above = levelAbove(p, level);
  if (!above) return false;
  return p.spaces.some(s => s.level === above.id && s.kind !== 'void' && !s.slabOpening && s.shape.some(poly => pointInPolygon(at, poly)));
}

export function checkIntegrity(p: Project): Issue[] {
  const out: Issue[] = [];
  const level = new Map(p.levels.map(l => [l.id, l]));

  for (const w of p.walls) {
    const lv = level.get(w.level);
    if (!lv || !STOREY_WALLS.has(w.kind)) continue;
    const H = wallHeight(p, w);

    // A wall of its own height taller than its storey goes through the slab above (fine where the slab is open: double height)
    if (w.height && !lv.roof && w.height > lv.height + 1) {
      const L = wallLength(w);
      const samples = [0.05, 0.5, 0.95].map(t => pointAt(w, t * L));
      if (samples.some(pt => slabAbove(p, w.level, pt)))
        out.push({
          code: 'wall-through-slab',
          severity: 'error',
          message: text('rule_wall_through_slab', '{wall} is {height} mm high, taller than its {storey} mm storey: it would go through the floor above', {
            wall: w.name,
            height: w.height,
            storey: lv.height,
          }),
          targets: [w.id],
        });
    }

    // Openings are hosted by their wall: they can't reach above it
    for (const o of w.openings)
      if (o.sill + o.height > H + 1)
        out.push({
          code: 'opening-above-wall',
          severity: 'error',
          message: text('rule_opening_above_wall', '{opening} reaches {top} mm above the floor, higher than {wall} ({height} mm)', {
            opening: o.name,
            top: o.sill + o.height,
            wall: w.name,
            height: H,
          }),
          targets: [o.id, w.id],
        });
  }

  // Furniture fits under the ceiling: the slab of the floor above, or the roof of a room with nothing above it
  const roofed = roofs(p);
  for (const f of p.furniture) {
    const lv = level.get(f.level);
    if (!lv) continue;
    const roof = roofed.find(r => r.level === f.level && r.shape.some(poly => pointInPolygon(f.position, poly)));
    const clear = roof ? roof.top - SLAB_THICKNESS : !lv.roof && slabAbove(p, f.level, f.position) ? lv.height - SLAB_THICKNESS : undefined;
    const top = (f.elevation ?? 0) + f.size.h;
    if (clear !== undefined && top > clear + 1)
      out.push({
        code: 'furniture-above-ceiling',
        severity: 'error',
        message: text('rule_furniture_above_ceiling', '{furniture} reaches {top} mm, above the ceiling ({clear} mm clear)', { furniture: f.name, top, clear }),
        targets: [f.id],
      });
  }

  return out;
}
