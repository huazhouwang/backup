/** Level capabilities. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';
import type { Level } from '../model/schema.js';
import { resolveLevel } from '../model/refs.js';
import { addOpening, addSpace, addWall } from './edit-helpers.js';
import { zRef } from './inputs.js';

export const levelAdd = defineEdit({
  name: 'level_add',
  title: 'Add level',
  description: "Add a level above the topmost non-roof level (the roof level moves up). With copy_from, copies that level's walls and spaces (not furniture).",
  input: z.object({ name: z.string(), height: z.number().positive().default(3000), copy_from: z.string().optional() }),
  label: i => text('log_level_add', 'Add level “{name}”', { name: i.name }),
  apply: (p, i) => {
    const roof = p.levels.find(l => l.roof);
    const floors = p.levels.filter(l => !l.roof);
    const top = floors[floors.length - 1];
    const elevation = top ? top.elevation + top.height : 0;
    let n = floors.length + 1,
      id = `L${n}`;
    while (p.levels.some(l => l.id === id)) id = `L${++n}`;
    const lv: Level = { id, name: i.name, elevation, height: i.height };
    p.levels.splice(roof ? p.levels.indexOf(roof) : p.levels.length, 0, lv);
    if (roof) roof.elevation = elevation + i.height;
    if (i.copy_from) {
      const src = resolveLevel(p, i.copy_from);
      for (const w of p.walls.filter(x => x.level === src.id)) {
        const nw = addWall(p, id, w.start, w.end, { thickness: w.thickness, kind: w.kind, height: w.height, name: w.name });
        for (const o of w.openings) addOpening(p, nw, o.kind, { ...o, name: o.name.replace(w.name, nw.name), glassBlock: o.glazing === 'glass-block' });
      }
      for (const s of p.spaces.filter(x => x.level === src.id)) addSpace(p, id, s.name, s.shape, s.kind, s.floor);
    }
    return { id, name: lv.name, elevation };
  },
});

export const levelRemove = defineEdit({
  name: 'level_remove',
  title: 'Delete level',
  permission: 'main',
  description: 'Delete a level with all its walls, spaces and furniture. Levels above move down. Affects the main design and needs owner confirmation.',
  input: z.object({ level: zRef('level') }),
  label: (i, p) => text('log_level_remove', 'Delete {level}', { level: resolveLevel(p, i.level).name }),
  apply: (p, i) => {
    const lv = resolveLevel(p, i.level);
    if (p.levels.filter(l => !l.roof).length <= 1 && !lv.roof) throw new TxError('invalid-input', text('err_last_level', 'At least one level must remain'));
    p.levels = p.levels.filter(l => l.id !== lv.id);
    for (const l of p.levels) if (l.elevation > lv.elevation) l.elevation -= lv.height;
    p.walls = p.walls.filter(x => x.level !== lv.id);
    p.spaces = p.spaces.filter(x => x.level !== lv.id);
    p.furniture = p.furniture.filter(x => x.level !== lv.id);
    p.elements = p.elements.filter(x => x.level !== lv.id);
    return { removed: lv.id };
  },
});
