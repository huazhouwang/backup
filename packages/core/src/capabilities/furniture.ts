/** Furniture capabilities. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { add, bbox, pointInPolygon, round } from '../geometry/geometry.js';
import { nextId, uniqueName } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import { NAME_SEPARATOR } from '../model/names.js';
import type { Furniture } from '../model/schema.js';
import { getFurniture, getSpace, resolve, resolveLevel } from '../model/refs.js';
import { zPoint, zRef } from './inputs.js';

export const furnitureAdd = defineEdit({
  name: 'furniture_add',
  title: 'Place furniture',
  description:
    'Place a piece of furniture. type is a furniture category (see furnitureTypes in project_summary; a new category is allowed if size is given). Without position it goes at the centre of space.',
  input: z.object({
    level: zRef('level').optional(),
    type: z.string(),
    position: zPoint.optional(),
    space: z.string().optional(),
    rotation: z.number().default(0).describe('Clockwise rotation (degrees)'),
    size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }).optional(),
    elevation: z.number().optional(),
    label: z.string().optional().describe('Display name of a new category, in the language the project data uses'),
  }),
  label: (i, p) => text('log_furniture_add', 'Place {type}', { type: p.library.furniture[i.type]?.name ?? i.label ?? i.type }),
  apply: (p, i) => {
    const s = i.space ? getSpace(p, i.space) : undefined;
    const level = s?.level ?? (i.level ? resolveLevel(p, i.level).id : undefined);
    if (!level) throw new TxError('invalid-input', text('err_level_or_space', 'Needs level or space'));
    let pos = i.position;
    if (!pos && s) {
      const [x0, y0, x1, y1] = bbox(s.shape);
      pos = round([(x0 + x1) / 2, (y0 + y1) / 2]);
    }
    if (!pos) throw new TxError('invalid-input', text('err_position_or_space', 'Needs position or space'));
    const def = p.library.furniture[i.type];
    if (!def) {
      if (!i.size)
        throw new TxError(
          'invalid-input',
          text('err_unknown_furniture', 'Furniture category {type} is not registered; give size (and label)', { type: i.type }),
        );
      p.library.furniture[i.type] = { name: i.label ?? i.type, size: i.size };
    }
    const size = i.size ?? def.size;
    const host = p.spaces.find(x => x.level === level && x.shape.some(q => pointInPolygon(pos!, q)));
    const label = p.library.furniture[i.type].name;
    const f: Furniture = {
      id: nextId(p, `${level}-f`),
      name: uniqueName(
        p.furniture.filter(x => x.level === level).map(x => x.name),
        host ? `${host.name}${NAME_SEPARATOR}${label}` : label,
        p.language,
      ),
      type: i.type,
      level,
      position: round(pos),
      rotation: i.rotation,
      size: { ...size },
      ...(i.elevation ? { elevation: i.elevation } : {}),
    };
    p.furniture.push(f);
    return { id: f.id, name: f.name };
  },
});

export const furnitureMove = defineEdit({
  name: 'furniture_move',
  title: 'Move furniture',
  description: 'Move or rotate furniture: position for an absolute location or by for a relative offset; rotation for the new angle.',
  input: z.object({ furniture: zRef('furniture'), position: zPoint.optional(), by: zPoint.optional(), rotation: z.number().optional() }),
  label: (i, p) => text('log_furniture_move', 'Move {furniture}', { furniture: resolve(p, 'furniture', i.furniture).name }),
  apply: (p, i) => {
    const f = getFurniture(p, i.furniture);
    if (i.position) f.position = round(i.position);
    if (i.by) f.position = round(add(f.position, i.by));
    if (i.rotation != null) f.rotation = i.rotation;
    return { id: f.id, position: f.position };
  },
});

export const furnitureRemove = defineEdit({
  name: 'furniture_remove',
  title: 'Remove furniture',
  description: 'Remove a piece of furniture.',
  input: z.object({ furniture: zRef('furniture') }),
  label: (i, p) => text('log_furniture_remove', 'Remove {furniture}', { furniture: resolve(p, 'furniture', i.furniture).name }),
  apply: (p, i) => {
    const f = getFurniture(p, i.furniture);
    p.furniture = p.furniture.filter(x => x.id !== f.id);
    return { removed: f.id };
  },
});
