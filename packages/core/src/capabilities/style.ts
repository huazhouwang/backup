/**
 * Design languages applied to a design (issue 217): a style's finishes (render/styles.ts) laid on every floor by the room's
 * role (model/roles.ts) and on the walls, as a designer redecorates a house. Walls, openings and spaces stay where they are.
 */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { DEFAULT_MATERIALS } from '../looks/builtin.js';
import { roomRole } from '../model/roles.js';
import { DEFAULT_STYLE_ID, STYLE_PRESETS, stylePreset } from '../render/styles.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';

export const styleApply = defineEdit({
  name: 'style_apply',
  title: 'Redecorate in a style',
  description: [
    "Redecorate the design in a design language, as a designer would: every floor gets the style's material for what the room is",
    '(living, bedroom, bath, stair, porch, terrace, courtyard…, read from the room), and the walls get its wall finish. The layout',
    'is untouched. Use it to give a design one coherent palette; then adjust single rooms with space_update or wall_update.',
    `Styles: ${STYLE_PRESETS.map(s => `${s.id} (${s.name.en})`).join(', ')}; ${DEFAULT_STYLE_ID} is the default.`,
  ].join(' '),
  input: z.object({
    style: z.string().describe('A style id or alias'),
    walls: z.boolean().default(true).describe('Refinish the walls too'),
  }),
  label: (i, p) => text('log_style_apply', 'Redecorate in style {style}', { style: stylePreset(i.style)?.name[p.language] ?? i.style }),
  apply: (p, i) => {
    const style = stylePreset(i.style);
    if (!style) throw new TxError('not-found', text('err_unknown_style', 'No style {style}', { style: i.style }));
    const f = style.finishes;
    let floors = 0,
      walls = 0;
    for (const s of p.spaces) {
      if (s.kind === 'void') continue;
      const floor = f.floors[roomRole(s)];
      if (s.floor !== floor) {
        s.floor = floor;
        floors++;
      }
    }
    if (i.walls)
      for (const w of p.walls) {
        if (w.kind === 'railing' || w.finish === f.walls) continue;
        w.finish = f.walls;
        walls++;
      }
    // The design's own copies of default materials would hide the style's: a design keeps only the materials it made itself
    for (const id of new Set([...Object.values(f.floors), f.walls])) if (DEFAULT_MATERIALS[id]) delete p.library.materials[id];
    p.extras = { ...p.extras, style: style.id };
    return { style: style.id, floors, walls };
  },
  examples: [{ input: { style: 'warm-courtyard' }, note: 'Warm white walls, grey stone floors, oak in the bedrooms, a rust accent' }],
});
