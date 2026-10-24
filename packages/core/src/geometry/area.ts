import { area, bbox, difference, union, wallBody } from './geometry.js';
import type { Id, Project, Space, Wall } from '../model/schema.js';

const M2 = 1e6;

/** Usable area (m²): space footprints minus actual wall bodies; railings are not deducted */
export function netArea(space: Space, walls: Wall[]): number {
  const bodies = walls.filter(w => w.level === space.level && w.kind !== 'railing').map(wallBody);
  return area(difference(space.shape, bodies)) / M2;
}

/**
 * Gross floor area (m²): indoor spaces plus the bearing walls and partitions around them, measured to the outer face of exterior walls.
 * Semi-outdoor, outdoor and roof-terrace spaces are excluded.
 */
export function grossArea(project: Project, level: Id): number {
  const indoor = project.spaces.filter(s => s.level === level && s.kind === 'indoor').flatMap(s => s.shape);
  if (!indoor.length) return 0;
  const boxes = indoor.map(p => bbox([p]));
  const touches = (b: [number, number, number, number]) => boxes.some(q => b[0] <= q[2] + 1 && b[2] >= q[0] - 1 && b[1] <= q[3] + 1 && b[3] >= q[1] - 1);
  const walls = project.walls
    .filter(w => w.level === level && (w.kind === 'bearing' || w.kind === 'partition'))
    .map(wallBody)
    .filter(p => touches(bbox([p])));
  return area(union([...indoor, ...walls])) / M2;
}

export interface AreaReport {
  levels: { id: Id; name: string; gross: number; spaces: { id: Id; name: string; kind: Space['kind']; net: number }[] }[];
  totalGross: number;
}

export function areaReport(project: Project): AreaReport {
  const levels = project.levels.map(l => ({
    id: l.id,
    name: l.name,
    gross: grossArea(project, l.id),
    spaces: project.spaces
      .filter(s => s.level === l.id && s.kind !== 'void')
      .map(s => ({ id: s.id, name: s.name, kind: s.kind, net: netArea(s, project.walls) })),
  }));
  return { levels, totalGross: levels.reduce((s, l) => s + l.gross, 0) };
}
