/**
 * Cameras for style renders (issue 195), picked from the design the way an architectural photographer would: the whole house from
 * above and from the street, then the largest rooms, each seen from the corner farthest from its window wall (the light comes
 * toward the camera's side, and the room reads deep). Plan coordinates in millimetres; heights are absolute (level elevation plus
 * eye height). The 3D layer frames the exterior shots on the house; room shots carry their eye and target.
 */
import { netArea } from '../geometry/area.js';
import { area, pointAt, wallLength, wallNormal } from '../geometry/geometry.js';
import { centroid, spaceWalls, wallSpaceSpan } from '../geometry/topology.js';
import { text } from '../i18n.js';
import type { Vec3 } from '../looks/recipe.js';
import type { Id, Point, Polygon, Project, Space } from '../model/schema.js';

/** Points and directions are [x, height, y]: plan x east, height up, plan y south (the 3D scene's axes, in millimetres) */

export type Shot =
  | { id: string; kind: 'aerial' | 'street'; name: string; dir: Vec3; fov: number }
  | { id: string; kind: 'room'; name: string; space: Id; eye: Vec3; target: Vec3; fov: number };

/** Looking down at about 45° from the south-east, as the 3D view starts */
const AERIAL: Vec3 = [0.9, 1.4, 1.1];
/** From the south-east at a person's height, looking slightly up at the house */
const STREET: Vec3 = [1, 0.12, 0.75];
const EYE = 1500;
const LOOK = 1300;
/** How far inside the room the camera stands from its corner */
const INSET = 500;
/** Rooms smaller than this (m²) make cramped photos */
const MIN_ROOM = 8;
export const MAX_ROOM_SHOTS = 4;

/** The design's shots: aerial, street, then up to MAX_ROOM_SHOTS rooms by size */
export function autoShots(p: Project, opts: { rooms?: number } = {}): Shot[] {
  const shots: Shot[] = [];
  if (!p.walls.length) return shots;
  shots.push({ id: 'aerial', kind: 'aerial', name: text('shot_aerial', 'Aerial'), dir: AERIAL, fov: 40 });
  shots.push({ id: 'street', kind: 'street', name: text('shot_street', 'From the street'), dir: STREET, fov: 45 });
  const elev = new Map(p.levels.map(l => [l.id, l.elevation]));
  const rooms = p.spaces
    .filter(s => s.kind === 'indoor' && !s.slabOpening)
    .map(s => ({ s, net: netArea(s, p.walls) }))
    .filter(r => r.net >= MIN_ROOM)
    .sort((a, b) => b.net - a.net || a.s.id.localeCompare(b.s.id))
    .slice(0, opts.rooms ?? MAX_ROOM_SHOTS);
  for (const { s } of rooms) {
    const view = roomView(p, s);
    if (!view) continue;
    const z = elev.get(s.level) ?? 0;
    shots.push({
      id: `room-${s.id}`,
      kind: 'room',
      name: s.name,
      space: s.id,
      eye: [view.eye[0], z + EYE, view.eye[1]],
      target: [view.target[0], z + LOOK, view.target[1]],
      fov: 70,
    });
  }
  return shots;
}

/** Where to stand in a room and what to look at: the middle of its window wall, from the room's corner farthest from it */
export function roomView(p: Project, s: Space): { eye: Point; target: Point } | null {
  const walls = spaceWalls(p, s).filter(b => b.wall.kind !== 'railing');
  if (!walls.length) return null;
  // The window wall: the most glass on the room's side, else the longest wall
  const glass = (b: (typeof walls)[number]) => {
    const span = wallSpaceSpan(b.wall, s);
    if (!span) return 0;
    return b.wall.openings
      .filter(o => o.kind === 'window' || o.kind === 'sliding-door')
      .filter(o => o.at >= span[0] - 1 && o.at <= span[1] + 1)
      .reduce((n, o) => n + o.width, 0);
  };
  const best = [...walls].sort((a, b) => glass(b) - glass(a) || b.length - a.length)[0];
  const span = wallSpaceSpan(best.wall, s) ?? [0, wallLength(best.wall)];
  const windows = best.wall.openings.filter(o => (o.kind === 'window' || o.kind === 'sliding-door') && o.at >= span[0] - 1 && o.at <= span[1] + 1);
  // Aim at the glass when there is some (its middle), else the middle of the wall's stretch along the room
  const along = windows.length ? windows.reduce((n, o) => n + o.at * o.width, 0) / windows.reduce((n, o) => n + o.width, 0) : (span[0] + span[1]) / 2;
  const n = wallNormal(best.wall);
  const inward = best.side * (best.wall.thickness / 2 + 50);
  const onWall = pointAt(best.wall, along);
  const target: Point = [onWall[0] + n[0] * inward, onWall[1] + n[1] * inward];
  // The corner of the room farthest from that point, stepped in toward the room's middle
  const poly = largest(s.shape);
  const corner = poly.outer.reduce((a, b) => (dist(b, target) > dist(a, target) ? b : a));
  const c = centroid(s);
  const toMid = dist(corner, c) || 1;
  const step = Math.min(INSET, toMid * 0.5);
  const eye: Point = [corner[0] + ((c[0] - corner[0]) / toMid) * step, corner[1] + ((c[1] - corner[1]) / toMid) * step];
  return { eye, target };
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const largest = (shape: Polygon[]) => shape.reduce((a, b) => (area([b]) > area([a]) ? b : a));
