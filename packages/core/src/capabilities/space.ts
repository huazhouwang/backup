/** Room and space capabilities. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { dot, MIN_SHARED_EDGE, scale, union, wallNormal } from '../geometry/geometry.js';
import { solveAreaMove } from '../rules/constraints.js';
import { moveWall, sharedLength, spaceWalls, uniqueName } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import type { Id, Opening } from '../model/schema.js';
import { getSpace, getWall, listText, resolve, resolveLevel } from '../model/refs.js';
import { r2 } from '../model/info.js';
import { addOpening, addSpace, centerOnSpace, ensureMaterial, renameWalls, toPolygon, wallsAround } from './edit-helpers.js';
import { DIR_VEC, zDirection, zRef, zShape, zSpaceKind, zWallKind } from './inputs.js';

export const roomAdd = defineEdit({
  name: 'room_add',
  title: 'Add room',
  description:
    'Add a room: creates the space and adds walls wherever its edges have none (existing walls are reused). Can also add a door on one side. Use it to build a design room by room from scratch.',
  input: z.object({
    level: zRef('level'),
    name: z.string(),
    ...zShape,
    kind: zSpaceKind.default('indoor'),
    floor: z.string().default('oak').describe('Floor material category'),
    wall_thickness: z.number().positive().default(120),
    wall_kind: zWallKind.default('partition'),
    door: z.object({ side: zDirection, width: z.number().positive().optional() }).optional().describe("Which side's wall gets a centred door"),
  }),
  label: i => text('log_room_add', 'Add room “{name}”', { name: i.name }),
  apply: (p, i) => {
    const level = resolveLevel(p, i.level).id;
    const poly = toPolygon(i);
    const walls = i.kind === 'outdoor' ? [] : wallsAround(p, level, poly, i.wall_thickness, i.wall_kind);
    const s = addSpace(p, level, i.name, [poly], i.kind, i.floor);
    renameWalls(p, level);
    let door: Opening | undefined;
    if (i.door) {
      const want = DIR_VEC[i.door.side];
      const b = spaceWalls(p, s)
        .map(x => ({ ...x, toward: scale(wallNormal(x.wall), -x.side) }))
        .filter(x => dot(x.toward, want) > 0.9)
        .sort((a, b2) => b2.length - a.length)[0];
      if (!b)
        throw new TxError(
          'invalid-input',
          text('err_no_wall_for_door', 'There is no wall on the {side} side of {space} to put a door in', {
            space: s.name,
            side: text(`err_side_${i.door.side}`, i.door.side),
          }),
        );
      door = addOpening(p, b.wall, 'door', { at: centerOnSpace(b.wall, s) ?? undefined, width: i.door.width });
    }
    return { id: s.id, name: s.name, walls: walls.map(w => ({ id: w.id, name: w.name })), door: door && { id: door.id, name: door.name } };
  },
  examples: [
    {
      input: { level: 'L2', name: '书房', rect: [10000, 120, 3000, 3480], door: { side: 'south' } },
      note: 'Add a 3 × 3.48 m study on level 2 with a door in the south wall',
    },
  ],
});

export const spaceAdd = defineEdit({
  name: 'space_add',
  title: 'Define space',
  description: 'Define a space only (e.g. courtyard, terrace, corridor), without adding walls.',
  input: z.object({ level: zRef('level'), name: z.string(), ...zShape, kind: zSpaceKind.default('indoor'), floor: z.string().default('tile') }),
  label: i => text('log_space_add', 'Define space “{name}”', { name: i.name }),
  apply: (p, i) => {
    const level = resolveLevel(p, i.level).id;
    const s = addSpace(p, level, i.name, [toPolygon(i)], i.kind, i.floor);
    return { id: s.id, name: s.name };
  },
});

export const spaceUpdate = defineEdit({
  name: 'space_update',
  title: 'Edit space',
  description: "Change a space's name, kind or floor material, or redefine its extent with rect / polygon (walls are not moved).",
  input: z.object({ space: zRef('space'), name: z.string().optional(), kind: zSpaceKind.optional(), floor: z.string().optional(), ...zShape }),
  label: (i, p) => text('log_space_update', 'Edit {space}', { space: resolve(p, 'space', i.space).name }),
  apply: (p, i) => {
    const s = getSpace(p, i.space);
    if (i.name) {
      s.name = uniqueName(
        p.spaces.filter(x => x.level === s.level && x !== s).map(x => x.name),
        i.name,
        p.language,
      );
      renameWalls(p, s.level);
    }
    if (i.kind) s.kind = i.kind;
    if (i.floor) {
      ensureMaterial(p, i.floor);
      s.floor = i.floor;
    }
    if (i.rect || i.polygon) s.shape = [toPolygon(i)];
    return { id: s.id, name: s.name };
  },
});

export const spaceRemove = defineEdit({
  name: 'space_remove',
  title: 'Delete space',
  description: 'Delete a space. With walls=true, also removes partitions that belong only to this space (bearing walls are kept).',
  input: z.object({ space: zRef('space'), walls: z.boolean().default(false) }),
  label: (i, p) => text('log_space_remove', 'Delete {space}', { space: resolve(p, 'space', i.space).name }),
  apply: (p, i) => {
    const s = getSpace(p, i.space);
    const removed: Id[] = [];
    if (i.walls) {
      for (const b of spaceWalls(p, s)) {
        if (b.wall.kind === 'bearing') continue;
        const shared = p.spaces.some(o => o.id !== s.id && o.level === s.level && sharedLength(b.wall, o) > MIN_SHARED_EDGE);
        if (!shared) removed.push(b.wall.id);
      }
      p.walls = p.walls.filter(w => !removed.includes(w.id));
    }
    p.spaces = p.spaces.filter(x => x.id !== s.id);
    return { removed: [s.id, ...removed] };
  },
});

export const spaceMerge = defineEdit({
  name: 'space_merge',
  title: 'Merge spaces',
  description: 'Merge several adjacent spaces into one (removing the partitions between them).',
  input: z.object({ spaces: z.array(zRef('space')).min(2), name: z.string().optional() }),
  label: (i, p) => text('log_space_merge', 'Merge {spaces}', { spaces: listText(i.spaces.map(s => resolve(p, 'space', s).name)) }),
  apply: (p, i) => {
    const ss = i.spaces.map(r => getSpace(p, r));
    const level = ss[0].level;
    if (ss.some(s => s.level !== level)) throw new TxError('invalid-input', text('err_merge_other_level', 'Only spaces on the same level can be merged'));
    const between = p.walls.filter(w => w.level === level && ss.filter(s => sharedLength(w, s) > MIN_SHARED_EDGE).length >= 2);
    if (between.some(w => w.kind === 'bearing'))
      throw new TxError(
        'structural',
        text('err_merge_bearing_wall', 'There is a bearing wall between them: removing it affects structural safety and needs professional review'),
      );
    p.walls = p.walls.filter(w => !between.includes(w));
    const keep = ss[0];
    keep.shape = union(ss.flatMap(s => s.shape));
    if (i.name)
      keep.name = uniqueName(
        p.spaces.filter(x => x.level === level && !ss.includes(x)).map(x => x.name),
        i.name,
        p.language,
      );
    p.spaces = p.spaces.filter(s => s === keep || !ss.includes(s));
    renameWalls(p, level);
    return { id: keep.id, removedWalls: between.map(w => w.id) };
  },
});

export const spaceSetArea = defineEdit({
  name: 'space_set_area',
  title: 'Set area',
  description:
    'Move one wall of a space so its usable area approaches the target (m²). Without a wall given, a partition is chosen automatically. Neighboring spaces shrink or grow accordingly.',
  input: z.object({
    space: zRef('space'),
    area: z.number().positive().describe('Target usable area (m²)'),
    wall: z.string().optional().describe('Wall to move'),
  }),
  label: (i, p) => text('log_space_set_area', 'Resize {space} to about {area} m²', { space: resolve(p, 'space', i.space).name, area: i.area }),
  apply: (p, i) => {
    const s = getSpace(p, i.space);
    const sol = solveAreaMove(p, s.id, i.area, i.wall ? getWall(p, i.wall).id : undefined);
    if (!sol) throw new TxError('cannot-resize', text('err_cannot_resize', '{space} has no suitable wall to move; specify wall', { space: s.name }));
    moveWall(p, sol.wall.id, sol.vector);
    renameWalls(p, s.level);
    return { space: s.id, wall: { id: sol.wall.id, name: sol.wall.name }, moved: sol.vector, area: r2(sol.area) };
  },
  examples: [{ input: { space: '老人房一', area: 12 }, note: 'Resize 老人房一 to about 12 m²' }],
});
