/** Opening (door, window, opening) capabilities. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import type { Opening } from '../model/schema.js';
import { getOpening, getSpace, getWall, resolve } from '../model/refs.js';
import { addOpening, centerOnSpace } from './edit-helpers.js';
import { zOpeningKind, zRef } from './inputs.js';

const OPENING_EN: Record<Opening['kind'], string> = { door: 'door', 'sliding-door': 'sliding door', gate: 'gate', window: 'window', opening: 'opening' };
/** Opening kind in UI text (operation log); names in project data use names.ts instead */
const openingText = (k: Opening['kind']) => text(`log_opening_${k.replace('-', '_')}`, OPENING_EN[k]);

export const openingAdd = defineEdit({
  name: 'opening_add',
  title: 'Add opening',
  description:
    'Add a door, window, sliding door or opening to a wall. Position it with at (distance from the opening centre to the wall start) or center_on (centred on the segment where a space meets this wall); with neither it goes at the wall midpoint.',
  input: z.object({
    wall: zRef('wall'),
    kind: zOpeningKind,
    at: z.number().optional(),
    center_on: z.string().optional().describe('Space ID or name'),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    sill: z.number().min(0).optional().describe('Sill height (mm)'),
    swing: z
      .object({ hinge: z.enum(['start', 'end']), side: z.enum(['left', 'right']) })
      .optional()
      .describe('Hinge end and swing side of a swing door (looking from start → end)'),
    glass_block: z.boolean().optional(),
    name: z.string().optional(),
  }),
  label: (i, p) => text('log_opening_add', 'Add a {opening} to {wall}', { wall: resolve(p, 'wall', i.wall).name, opening: openingText(i.kind) }),
  apply: (p, i) => {
    const w = getWall(p, i.wall);
    let at = i.at;
    if (at == null && i.center_on) {
      const c = centerOnSpace(w, getSpace(p, i.center_on));
      if (c == null) throw new TxError('invalid-input', text('err_not_adjacent', '{space} does not touch {wall}', { space: i.center_on, wall: w.name }));
      at = c;
    }
    const o = addOpening(p, w, i.kind, { ...i, at, glassBlock: i.glass_block });
    return { id: o.id, name: o.name, at: o.at };
  },
  examples: [{ input: { wall: '主卧北墙', kind: 'window', width: 1500, center_on: '主卧' }, note: 'Add a 1.5 m wide window centred on 主卧北墙' }],
});

export const openingUpdate = defineEdit({
  name: 'opening_update',
  title: 'Edit opening',
  description: "Change an opening's position, size, kind or swing.",
  input: z.object({
    opening: zRef('opening'),
    at: z.number().optional(),
    move_by: z.number().optional().describe('Move along the wall (mm; positive toward the wall end)'),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    sill: z.number().min(0).optional(),
    kind: zOpeningKind.optional(),
    swing: z.object({ hinge: z.enum(['start', 'end']), side: z.enum(['left', 'right']) }).optional(),
    name: z.string().optional(),
  }),
  label: (i, p) => text('log_opening_update', 'Edit {opening}', { opening: resolve(p, 'opening', i.opening).name }),
  apply: (p, i) => {
    const { o } = getOpening(p, i.opening);
    if (i.at != null) o.at = Math.round(i.at);
    if (i.move_by) o.at = Math.round(o.at + i.move_by);
    for (const k of ['width', 'height', 'sill', 'name'] as const) if (i[k] != null) (o as any)[k] = i[k];
    if (i.kind) {
      o.kind = i.kind;
      if (i.kind !== 'door') delete o.swing;
      else o.swing ??= { hinge: 'start', side: 'right' };
    }
    if (i.swing) o.swing = i.swing;
    return { id: o.id };
  },
});

export const openingRemove = defineEdit({
  name: 'opening_remove',
  title: 'Close opening',
  description: 'Close up (remove) an opening.',
  input: z.object({ opening: zRef('opening') }),
  label: (i, p) => text('log_opening_remove', 'Close up {opening}', { opening: resolve(p, 'opening', i.opening).name }),
  apply: (p, i) => {
    const { w, o } = getOpening(p, i.opening);
    w.openings = w.openings.filter(x => x.id !== o.id);
    return { removed: o.id };
  },
});
