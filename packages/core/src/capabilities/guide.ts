/**
 * Guides, as SketchUp's: construction lines and points to line things up with (see Guide in schema.ts). People draw them with
 * the tape measure; the agent can draw them too, e.g. a line 3600 mm south of the north wall to place things along.
 */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { nextId } from '../geometry/topology.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import { names } from '../model/names.js';
import type { Guide, Project } from '../model/schema.js';
import { resolve, resolveLevel } from '../model/refs.js';
import { zPoint } from './inputs.js';

const AXIS: Record<'x' | 'y' | 'z', [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** A direction given as an axis or a vector, made a unit vector */
function unit(d: 'x' | 'y' | 'z' | number[]): [number, number, number] {
  if (typeof d === 'string') return AXIS[d];
  const [x = 0, y = 0, z = 0] = d;
  const len = Math.hypot(x, y, z);
  if (!len) throw new TxError('invalid-input', text('err_guide_direction', 'A guide line needs a direction'));
  const r = (v: number) => Math.round((v / len) * 1e6) / 1e6;
  return [r(x), r(y), r(z)];
}

/** 参考线1, 参考线2 … / Guide 1, Guide 2 …: the first number not taken */
function guideName(p: Project) {
  const used = new Set((p.guides ?? []).map(g => g.name));
  const word = names(p).guide;
  for (let n = 1; ; n++) {
    const name = p.language === 'en' ? `${word} ${n}` : `${word}${n}`;
    if (!used.has(name)) return name;
  }
}

const height = (p: Project, level: string | undefined, h: number | undefined) => (level ? resolveLevel(p, level).elevation : 0) + (h ?? 0);

export const guideAdd = defineEdit({
  name: 'guide_add',
  title: 'Add a guide',
  description:
    'Draw a guide (a construction line, or a point) to line things up with; it is not part of the building. A line runs without end through at along direction: "x" (east–west), "y" (north–south), "z" (up) or a vector [dx, dy, dz]. Heights: height above the floor of level (default the ground floor), e.g. a sill line.',
  input: z.object({
    kind: z.enum(['line', 'point']).default('line'),
    at: zPoint,
    direction: z.union([z.enum(['x', 'y', 'z']), z.array(z.number()).min(2).max(3)]).default('x'),
    level: z.string().optional().describe('Level ID or name the height is measured from'),
    height: z.number().optional().describe('Height above that level’s floor (mm)'),
  }),
  label: () => text('log_guide_add', 'Add a guide'),
  apply: (p, i) => {
    p.guides ??= [];
    const g: Guide = {
      id: nextId(p, 'g'),
      name: guideName(p),
      kind: i.kind,
      at: [Math.round(i.at[0]), Math.round(i.at[1]), Math.round(height(p, i.level, i.height))],
      ...(i.kind === 'line' ? { dir: unit(i.direction) } : {}),
    };
    p.guides.push(g);
    return { id: g.id, name: g.name };
  },
});

export const guideMove = defineEdit({
  name: 'guide_move',
  title: 'Move a guide',
  description: 'Move a guide: at for its new plan point (and level/height for its height), or by for an offset [dx, dy] or [dx, dy, dz].',
  input: z.object({
    guide: z.string(),
    at: zPoint.optional(),
    level: z.string().optional(),
    height: z.number().optional(),
    by: z.array(z.number()).min(2).max(3).optional(),
  }),
  label: (i, p) => text('log_guide_move', 'Move {guide}', { guide: resolve(p, 'guide', i.guide).name }),
  apply: (p, i) => {
    const g = resolve(p, 'guide', i.guide).obj;
    if (i.at) g.at = [Math.round(i.at[0]), Math.round(i.at[1]), g.at[2]];
    if (i.level != null || i.height != null) g.at[2] = Math.round(height(p, i.level, i.height));
    if (i.by) g.at = [Math.round(g.at[0] + i.by[0]), Math.round(g.at[1] + i.by[1]), Math.round(g.at[2] + (i.by[2] ?? 0))];
  },
});

export const guideRemove = defineEdit({
  name: 'guide_remove',
  title: 'Remove guides',
  description: 'Remove guides by ID or name, or all of them with all: true.',
  input: z.object({ guides: z.array(z.string()).default([]), all: z.boolean().default(false) }),
  label: i => (i.all ? text('log_guide_clear', 'Clear the guides') : text('log_guide_remove', 'Remove guides')),
  apply: (p, i) => {
    const gone = i.all ? new Set((p.guides ?? []).map(g => g.id)) : new Set(i.guides.map(ref => resolve(p, 'guide', ref).id));
    p.guides = (p.guides ?? []).filter(g => !gone.has(g.id));
    return { removed: gone.size };
  },
});
