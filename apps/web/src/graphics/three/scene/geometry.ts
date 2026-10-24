/**
 * Geometry of a house's parts in metres, shared by the editor's 3D view and the house stills: walls, floor slabs, elements'
 * solids, and the box that frames what is shown.
 */
import { rect, union, wallBoxes, wallDir, type Polygon, type Project, type Solid, type Wall, type Box } from '@plinth/core';
import * as THREE from 'three';
import { M } from './units';

/** Plan polygons (x, z in millimetres) as three.js shapes in a plane whose second axis is -z, ready to extrude upwards */
const planShapes = (polygons: Polygon[]) =>
  polygons.map(p => {
    const sh = new THREE.Shape(p.outer.map(([x, z]) => new THREE.Vector2(x * M, -z * M)));
    for (const h of p.holes ?? []) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x * M, -z * M))));
    return sh;
  });

/** Plan polygons extruded upwards from y = 0 by a height in millimetres */
export const extrudeUp = (polygons: Polygon[], height: number) =>
  new THREE.ExtrudeGeometry(planShapes(polygons), { depth: height * M, bevelEnabled: false }).rotateX(-Math.PI / 2);

/** A floor slab: the space's shape, as thick as given, with its top at y = thickness (place it at its top minus its thickness) */
export const slabGeometry = (shape: Polygon[], thickness: number) => extrudeUp(shape, thickness);

/** A piece of an element (a stair step, a pond's rim or water): its plan outline extruded by its height */
export const solidGeometry = (s: Solid) => extrudeUp([{ outer: s.outline }], s.height);

/**
 * A wall as one solid, placed at the wall's start: the elevation of its pieces (piers, sills, lintels; see wallBoxes) merged into
 * one outline with the openings as holes, extruded through the wall's thickness. Drawn as separate boxes, the faces where pieces
 * meet would flicker through the wall face as dotted edges. Glass and railings are drawn by their looks. `below`: how far the
 * wall continues down from its level to the ground (see footing), in millimetres.
 */
export function wallGeometry(project: Project, w: Wall, below = 0) {
  const d = wallDir(w);
  // Each piece as a rectangle in elevation: along the wall from its start, and height
  const rects = wallBoxes(project, w)
    .filter(b => b.kind !== 'glass-block' && b.kind !== 'glass')
    .map(b => {
      const u = (b.center[0] - w.start[0]) * d[0] + (b.center[1] - w.start[1]) * d[1];
      return { outer: rect(u - b.length / 2, b.z, u + b.length / 2, b.z + b.height).outer };
    });
  if (below > 0 && rects.length) {
    const us = rects.flatMap(r => r.outer.map(([u]) => u));
    rects.push({ outer: rect(Math.min(...us), -below, Math.max(...us), 0).outer });
  }
  const shapes = union(rects).map(p => {
    const sh = new THREE.Shape(p.outer.map(([u, v]) => new THREE.Vector2(u * M, v * M)));
    for (const h of p.holes ?? []) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u * M, v * M))));
    return sh;
  });
  const g = new THREE.ExtrudeGeometry(shapes, { depth: w.thickness * M, bevelEnabled: false });
  g.translate(0, 0, (-w.thickness / 2) * M);
  // Elevation axes to the plan: u along the wall, v up, extruded across it
  const x = new THREE.Vector3(d[0], 0, d[1]),
    y = new THREE.Vector3(0, 1, 0);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
  return g;
}

/** A railing's pieces between its openings (millimetres, relative to its level): each is built by the railing's look */
export const railingPieces = (project: Project, w: Wall) => wallBoxes(project, w).filter(b => b.kind === 'railing');

/** The plan extent of an element's solids (millimetres) and their height: what its look's extra parts are built at */
export function elementExtent(solids: Solid[]) {
  const pts = solids.flatMap(s => s.outline);
  const x0 = Math.min(...pts.map(p => p[0])),
    x1 = Math.max(...pts.map(p => p[0])),
    z0 = Math.min(...pts.map(p => p[1])),
    z1 = Math.max(...pts.map(p => p[1]));
  return { w: x1 - x0, d: z1 - z0, h: Math.max(...solids.map(s => s.z + s.height)), center: [(x0 + x1) / 2, (z0 + z1) / 2] as const };
}

/** The site's extent in millimetres: [x0, y0, x1, y1] */
export function siteBounds(project: Project): [number, number, number, number] {
  const xs = project.site.boundary.map(p => p[0]),
    ys = project.site.boundary.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * The extent of the shown floors in metres, for framing the camera: their walls and floors (the site, 3 m high, when there are
 * none)
 */
export function houseBox(project: Project, boxes: Box[], levels: Set<string>) {
  const elev = new Map(project.levels.map(l => [l.id, l.elevation]));
  const box = new THREE.Box3();
  for (const b of boxes) {
    if (!levels.has(b.level)) continue;
    const base = elev.get(b.level) ?? 0;
    const dx = (Math.cos(b.angle) * b.length) / 2,
      dz = (Math.sin(b.angle) * b.length) / 2;
    box.expandByPoint(new THREE.Vector3((b.center[0] - dx) * M, (base + b.z) * M, (b.center[1] - dz) * M));
    box.expandByPoint(new THREE.Vector3((b.center[0] + dx) * M, (base + b.z + b.height) * M, (b.center[1] + dz) * M));
  }
  for (const sp of project.spaces) {
    if (!levels.has(sp.level)) continue;
    for (const p of sp.shape) for (const [x, z] of p.outer) box.expandByPoint(new THREE.Vector3(x * M, (elev.get(sp.level) ?? 0) * M, z * M));
  }
  if (box.isEmpty()) {
    const [x0, y0, x1, y1] = siteBounds(project);
    box.set(new THREE.Vector3(x0 * M, 0, y0 * M), new THREE.Vector3(x1 * M, 3, y1 * M));
  }
  return box;
}
