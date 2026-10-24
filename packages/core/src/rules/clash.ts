/**
 * Clash detection, as BIM coordination tools (Navisworks, Solibri) run it: category pairs checked against each other on the
 * derived geometry, with tolerances, and contacts that happen in a real building accepted:
 * - furniture standing inside a wall body is an error. Furniture against a wall face, in a doorway (the door check covers that),
 *   or mounted on the wall (above the floor: an awning, a grab bar, a wall cabinet; BIM's wall-hosted families) is fine.
 * - two pieces of furniture in the same place (each mostly inside the other) are a warning; a stool in a shower, a chair under a
 *   table or a rug under a sofa are fine.
 * - an element (stairs, a pond) reaching into a wall beyond its centreline is a warning: spaces, and so elements drawn in them,
 *   run to the wall centrelines in this model.
 */
import pc from 'polygon-clipping';
import { area, dot, furnitureFootprint, sub, toPc, wallBody, wallDir, wallNormal } from '../geometry/geometry.js';
import { projectElements } from '../geometry/elements.js';
import { wallHeight } from '../geometry/mesh.js';
import { overlapArea } from '../geometry/topology.js';
import { text } from '../i18n.js';
import { footing } from '../model/levels.js';
import type { Furniture, Point, Polygon, Project, Wall } from '../model/schema.js';
import type { Issue } from './rules.js';

/** How far something may reach into a wall before it counts (mm): what snapping and rounding leave against a face */
const WALL_TOLERANCE = 20;
/** Pieces this low (rugs, mats) lie under others */
const FLAT = 30;
/** Two pieces clash when each is mostly inside the other: a piece inside a larger one (a stool in a shower) doesn't */
const FURNITURE_SHARE = 0.5;
const PASSAGE = new Set(['door', 'sliding-door', 'opening', 'gate']);

/** Whether two height ranges [bottom, top] overlap by more than a millimetre */
const heightsMeet = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1;

/**
 * How deep a plan shape reaches into a wall body, across the wall (mm), and where along the wall it does; 0 when it only
 * touches a face
 */
function intoWall(w: Wall, shape: Polygon): { depth: number; along: [number, number] } {
  const inter = pc.intersection([toPc(wallBody(w))], [toPc(shape)]);
  const pts = inter.flat(2) as unknown as Point[];
  if (!pts.length) return { depth: 0, along: [0, 0] };
  const n = wallNormal(w),
    d = wallDir(w);
  const across = pts.map(p => dot(sub(p, w.start), n)),
    alongs = pts.map(p => dot(sub(p, w.start), d));
  return { depth: Math.max(...across) - Math.min(...across), along: [Math.min(...alongs), Math.max(...alongs)] };
}

/** Whether a stretch along a wall lies in one of its doorways (a passage from the floor up) */
const inDoorway = (w: Wall, [a, b]: [number, number]) =>
  w.openings.some(o => PASSAGE.has(o.kind) && o.sill <= 1 && a >= o.at - o.width / 2 - 1 && b <= o.at + o.width / 2 + 1);

const furnitureHeights = (f: Furniture): [number, number] => [f.elevation ?? 0, (f.elevation ?? 0) + f.size.h];

export function checkClashes(p: Project): Issue[] {
  const out: Issue[] = [];
  // A wall stands from its floor to its top; on the ground floor it continues down to the ground
  const elevation = new Map(p.levels.map(l => [l.id, l.elevation]));
  const walls = p.walls.map(w => ({ w, H: wallHeight(p, w), bottom: -footing(elevation.get(w.level) ?? 0, p.site.groundLevel) }));
  const footprints = new Map(p.furniture.map(f => [f.id, furnitureFootprint(f)]));

  // Furniture standing inside a wall body (pieces mounted above the floor are hosted by the wall)
  for (const f of p.furniture) {
    if (f.elevation) continue;
    const fp = footprints.get(f.id)!;
    for (const { w, H, bottom } of walls) {
      if (w.level !== f.level || !heightsMeet(furnitureHeights(f), [bottom, H])) continue;
      const { depth, along } = intoWall(w, fp);
      if (depth > WALL_TOLERANCE && !inDoorway(w, along))
        out.push({
          code: 'furniture-in-wall',
          severity: 'error',
          message: text('rule_furniture_in_wall', '{furniture} reaches {depth} mm into {wall}', { furniture: f.name, depth: Math.round(depth), wall: w.name }),
          targets: [f.id, w.id],
        });
    }
  }

  // Furniture in the same place: each mostly within the other, at the same height (rugs and mats lie under others)
  const pieces = p.furniture.filter(f => f.size.h > FLAT);
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i],
        b = pieces[j];
      if (a.level !== b.level || !heightsMeet(furnitureHeights(a), furnitureHeights(b))) continue;
      const fa = footprints.get(a.id)!,
        fb = footprints.get(b.id)!;
      const larger = Math.max(area([fa]), area([fb]));
      if (larger > 0 && overlapArea([fa], [fb]) > FURNITURE_SHARE * larger)
        out.push({
          code: 'furniture-overlap',
          severity: 'warning',
          message: text('rule_furniture_overlap', '{a} and {b} are in the same place', { a: a.name, b: b.name }),
          targets: [a.id, b.id],
        });
    }

  // Elements (stairs, ponds…) inside a wall body, beyond its centreline
  const seen = new Set<string>();
  for (const s of projectElements(p).flatMap(g => g.solids)) {
    for (const { w, H, bottom } of walls) {
      const key = `${s.id}:${w.id}`;
      if (seen.has(key) || w.level !== s.level || !heightsMeet([s.z, s.z + s.height], [bottom, H])) continue;
      if (intoWall(w, { outer: s.outline }).depth > w.thickness / 2 + WALL_TOLERANCE) {
        seen.add(key);
        const e = p.elements.find(x => x.id === s.id);
        out.push({
          code: 'element-in-wall',
          severity: 'warning',
          message: text('rule_element_in_wall', '{element} runs into {wall}', { element: e?.name ?? s.id, wall: w.name }),
          targets: [s.id, w.id],
        });
      }
    }
  }

  return out;
}
