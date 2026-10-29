/**
 * Materials of the design (issue 210): what walls' finishes, floors and looks are made of beyond the default library. A design
 * material with a default material's id stands in for it in this design only.
 */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { DEFAULT_MATERIALS, materialOf } from '../looks/builtin.js';
import type { Material } from '../looks/material.js';
import { TEXTURES } from '../looks/textures.js';
import { TxError } from '../session/session.js';
import { text } from '../i18n.js';

/** A CSS hex colour (#rgb or #rrggbb, sRGB) as a glTF colour: linear, opaque */
function linearColor(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  const lin = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return Math.round((c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * 1e4) / 1e4;
  };
  return [lin(0), lin(2), lin(4), 1];
}

export const materialDefine = defineEdit({
  name: 'material_define',
  title: 'Define a material',
  description: [
    "Define or change a material of the design, for walls' finishes (wall_update finish), floors (space_update floor) and looks.",
    'Start from an existing material (from: its id, keeping its pattern, sizes and texture) and change what differs; a new id adds a material, an existing id of the design changes it everywhere it is used, and a default material id makes a version of it for this design only.',
    `texture: a photographed texture set laid at its real size and tinted to the colour (${Object.keys(TEXTURES).join(' ')}), or null for a plain colour.`,
    `Default materials: ${Object.keys(DEFAULT_MATERIALS).join(' ')}.`,
  ].join(' '),
  input: z.object({
    id: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
      .max(64)
      .describe('Material id'),
    from: z.string().optional().describe('An existing material to start from'),
    name: z.string().min(1).max(200).optional().describe('Its name, in the language the project data uses'),
    color: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .optional()
      .describe('Its colour as CSS hex (sRGB), e.g. #d9cbb5'),
    roughness: z.number().min(0).max(1).optional().describe('0 polished … 1 matt'),
    texture: z.string().nullable().optional().describe('A texture set id, or null for none'),
  }),
  label: i => text('log_material_define', 'Define material “{material}”', { material: i.name ?? i.id }),
  apply: (p, i) => {
    const base = materialOf(i.from ?? i.id, null, p.library.materials);
    if (i.from && !base) throw new TxError('not-found', text('err_unknown_material', 'No material {material}', { material: i.from }));
    if (!base && !i.name) throw new TxError('invalid-input', text('err_material_name', 'A new material needs a name'));
    if (i.texture && !TEXTURES[i.texture]) throw new TxError('invalid-input', text('err_unknown_texture', 'No texture set {texture}', { texture: i.texture }));
    const pbr = base?.pbrMetallicRoughness ?? { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 0.9 };
    const extras = { ...base?.extras };
    if (i.texture === null) delete extras.texture;
    else if (i.texture) extras.texture = i.texture;
    const m: Material = {
      ...base,
      name: i.name ? { [p.language]: i.name } : base!.name,
      pbrMetallicRoughness: {
        ...pbr,
        ...(i.color && { baseColorFactor: linearColor(i.color) }),
        ...(i.roughness !== undefined && { roughnessFactor: i.roughness }),
      },
      ...(Object.keys(extras).length ? { extras } : {}),
    };
    if (!Object.keys(extras).length) delete m.extras;
    p.library.materials = { ...p.library.materials, [i.id]: m };
    return { id: i.id };
  },
  examples: [
    { input: { id: 'limewash', from: 'paint', name: '米白石灰墙', color: '#e8dfcf' }, note: 'A warm off-white wall finish' },
    { input: { id: 'greystone', from: 'stonewall', name: '青灰毛石', color: '#7d8186', texture: 'rubble' }, note: 'Grey rubble stone' },
  ],
});
