/** Wall capabilities. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { materialOf } from '../looks/builtin.js';
import { dot, round, scale, wallNormal } from '../geometry/geometry.js';
import { moveWall } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import type { Point } from '../model/schema.js';
import { getWall, resolve, resolveLevel } from '../model/refs.js';
import { addWall, renameWalls, setWallName } from './edit-helpers.js';
import { DIR_VEC, zDirection, zPoint, zRef, zWallKind } from './inputs.js';

export const wallAdd = defineEdit({
  name: 'wall_add',
  title: 'Add wall',
  description: 'Add a straight wall on the given level. Endpoints lie on the wall centreline.',
  input: z.object({
    level: zRef('level'),
    start: zPoint,
    end: zPoint,
    thickness: z.number().positive().optional().describe('Wall thickness; defaults to 120 for partitions, 240 for bearing walls'),
    kind: zWallKind.default('partition'),
    height: z.number().positive().optional(),
    name: z.string().optional(),
  }),
  label: () => text('log_wall_add', 'Add wall'),
  apply: (p, i) => {
    const w = addWall(p, resolveLevel(p, i.level).id, i.start, i.end, i);
    if (i.name) w.extras = { ...w.extras, customName: true };
    return { id: w.id, name: w.name };
  },
  examples: [{ input: { level: 'L1', start: [3000, 120], end: [3000, 3600], thickness: 120 }, note: 'Add a north-south partition on level 1' }],
});

export const wallMove = defineEdit({
  name: 'wall_move',
  title: 'Move wall',
  description:
    'Translate a wall perpendicular to itself. Connected walls stretch to follow, the boundaries of spaces on both sides update, openings keep their position on the wall, and furniture standing against the wall (or mounted on it) moves with it.',
  input: z.object({
    wall: zRef('wall'),
    direction: zDirection.optional(),
    distance: z.number().optional().describe('Distance to move (mm)'),
    to: z.number().optional().describe('Move directly to a coordinate: y for east-west walls, x for north-south walls'),
  }),
  label: (i, p) => text('log_wall_move', 'Move {wall}', { wall: resolve(p, 'wall', i.wall).name }),
  apply: (p, i) => {
    const w = getWall(p, i.wall);
    const n = wallNormal(w);
    let v: Point;
    if (i.to != null) {
      const horiz = Math.abs(n[1]) > Math.abs(n[0]);
      v = horiz ? [0, i.to - w.start[1]] : [i.to - w.start[0], 0];
    } else {
      if (!i.direction || i.distance == null) throw new TxError('invalid-input', text('err_direction_or_to', 'Needs direction + distance, or to'));
      v = scale(DIR_VEC[i.direction], i.distance);
    }
    // Keep only the component perpendicular to the wall
    const k = dot(v, n);
    if (Math.abs(k) < 1)
      throw new TxError('invalid-input', text('err_move_parallel', '{wall} cannot move in this direction (it is parallel to the wall)', { wall: w.name }));
    moveWall(p, w.id, round(scale(n, k)));
    renameWalls(p, w.level);
    return { id: w.id, start: w.start, end: w.end };
  },
  examples: [{ input: { wall: '老人房一西墙', direction: 'west', distance: 500 }, note: 'Move 老人房一西墙 0.5 m west' }],
});

export const wallUpdate = defineEdit({
  name: 'wall_update',
  title: 'Edit wall',
  description:
    "Change a wall's thickness, kind, height, finish or name. The finish is a material of the design or the default library (paint, greybrick, redbrick, stonewall, woodcladding, concrete…); null goes back to white paint.",
  input: z.object({
    wall: zRef('wall'),
    thickness: z.number().positive().optional(),
    kind: zWallKind.optional(),
    height: z.number().positive().nullable().optional(),
    finish: z.string().nullable().optional().describe('Material id of its faces, or null for white paint'),
    name: z.string().optional(),
  }),
  label: (i, p) => text('log_wall_update', 'Edit {wall}', { wall: resolve(p, 'wall', i.wall).name }),
  apply: (p, i) => {
    const w = getWall(p, i.wall);
    if (i.thickness) w.thickness = i.thickness;
    if (i.kind) w.kind = i.kind;
    if (i.height === null) delete w.height;
    else if (i.height) w.height = i.height;
    if (i.finish === null) delete w.finish;
    else if (i.finish) {
      if (!materialOf(i.finish, null, p.library.materials))
        throw new TxError('invalid-input', text('err_unknown_material', 'No material {material}', { material: i.finish }));
      w.finish = i.finish;
    }
    if (i.name) {
      setWallName(p, w, i.name);
      w.extras = { ...w.extras, customName: true };
    }
    return { id: w.id };
  },
});

export const wallRemove = defineEdit({
  name: 'wall_remove',
  title: 'Remove wall',
  description: 'Remove a wall (with its openings). Spaces on both sides are not merged automatically; use space_merge if needed.',
  input: z.object({ wall: zRef('wall') }),
  label: (i, p) => text('log_wall_remove', 'Remove {wall}', { wall: resolve(p, 'wall', i.wall).name }),
  apply: (p, i) => {
    const w = getWall(p, i.wall);
    if (w.kind === 'bearing')
      throw new TxError(
        'structural',
        text(
          'err_remove_bearing_wall',
          '{wall} is a bearing wall: removing it affects structural safety and needs professional review. Confirm with the owner and change it to a partition before removing it',
          { wall: w.name },
        ),
      );
    p.walls = p.walls.filter(x => x.id !== w.id);
    return { removed: w.id };
  },
});
