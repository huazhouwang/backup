/**
 * Texture sets (issue 210): photographed PBR maps with a real-world size, built in like system fonts (libraries/textures.json,
 * format in libraries/textures.schema.json; images in libraries/textures/<id>/, made by scripts/textures.mjs). A material names
 * one in `extras.texture`; library files stay portable because they carry the id, never a path. The renderer lays a set at its
 * real size and tints it so the surface averages to the material's colour, which stays what the plan and swatches show.
 */
import { z } from 'zod';
import texturesFile from '../../../../libraries/textures.json' with { type: 'json' };
import { namesSchema, type Material, type Names } from './material.js';

export interface TextureSet {
  name: Names;
  source: { polyhaven?: string; url?: string; authors?: string[]; license?: string };
  /** What one image covers, mm: [w, h] */
  size: [number, number];
  /** One tile, brick or board of the photo (with its joint), mm: a material with a pattern scales the set so its own unit fits */
  unit?: [number, number];
  /** The colour map is in greys: all colour comes from the material */
  neutral?: boolean;
  /** Paths under libraries/textures/: colour, OpenGL normal, and AO / roughness / metalness packed as R, G, B (glTF's ARM) */
  maps: { color: string; normal?: string; arm?: string };
  /** The colour map's average linear colour */
  average: [number, number, number];
}

const size = z.tuple([z.number().positive(), z.number().positive()]);
const textureSetSchema: z.ZodType<TextureSet> = z.object({
  name: namesSchema,
  source: z.object({ polyhaven: z.string().optional(), url: z.string().optional(), authors: z.array(z.string()).optional(), license: z.string().optional() }),
  size,
  unit: size.optional(),
  neutral: z.boolean().optional(),
  maps: z.object({ color: z.string(), normal: z.string().optional(), arm: z.string().optional() }),
  average: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]),
});

const catalogSchema = z.object({ format: z.literal('opensu-textures'), formatVersion: z.literal(1), textures: z.record(z.string(), textureSetSchema) });

/** Every built-in texture set, by id */
export const TEXTURES: Record<string, TextureSet> = catalogSchema.parse(texturesFile).textures;

/** A material's texture set, if it names one that exists */
export const textureOf = (m: Material | undefined): TextureSet | undefined => (m?.extras?.texture ? TEXTURES[m.extras.texture] : undefined);

/**
 * How much one image of the set covers on this material, mm. A material with a pattern scales a set with a unit so the photo's
 * tiles, bricks or boards come out at the material's size (uniformly, keeping the photo's proportions).
 */
export function textureSize(m: Material, set: TextureSet): [number, number] {
  const own = m.extras?.size;
  const first = Array.isArray(own) ? own[0] : own;
  const k = set.unit && m.extras?.pattern && first ? first / set.unit[0] : 1;
  return [set.size[0] * k, set.size[1] * k];
}

/** Materials naming a texture set that doesn't exist, as problems (`where` prefixes each) */
export const unknownTextures = (materials: Record<string, Material> | undefined, where: string): string[] =>
  Object.entries(materials ?? {})
    .filter(([, m]) => m.extras?.texture && !TEXTURES[m.extras.texture])
    .map(([k, m]) => `${where}${k}: unknown texture set ${m.extras!.texture} (one of ${Object.keys(TEXTURES).join(' ')})`);
