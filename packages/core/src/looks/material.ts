/**
 * Materials, as glTF 2.0 materials (https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials) with our procedural
 * texture in `extras`, and the multilingual names libraries use. Material properties are fixed by the renderer, the way CSS
 * properties are fixed by the browser: a new one is added to the renderer first, then here as an optional field.
 */
import { z } from 'zod';
import type { ProjectLanguage } from '../model/schema.js';

/** Text in several languages; looks made by the agent may carry only the project's language */
export type Names = Partial<Record<ProjectLanguage, string>>;
export const namesSchema: z.ZodType<Names> = z
  .object({ zh: z.string().max(200).optional(), en: z.string().max(200).optional() })
  .refine(n => !!(n.zh || n.en), 'needs a name in at least one language');

/** A name in a language, else in any language the text has */
export const nameIn = (n: Names | string | undefined, lang: ProjectLanguage): string => (typeof n === 'string' ? n : (n?.[lang] ?? n?.zh ?? n?.en ?? ''));

/** Linear RGBA, 0..1 (glTF) */
export type RGBA = [number, number, number, number];

/** Procedural textures a material can carry (our glTF `extras`) */
export const MATERIAL_PATTERNS = ['planks', 'tiles', 'bricks', 'speckled', 'marble'] as const;
export type MaterialPattern = (typeof MATERIAL_PATTERNS)[number];

/** A glTF 2.0 material with our procedural texture in `extras` */
export interface Material {
  name: Names;
  pbrMetallicRoughness: { baseColorFactor: RGBA; metallicFactor?: number; roughnessFactor?: number };
  /** OPAQUE (default), or BLEND with the alpha in baseColorFactor */
  alphaMode?: 'OPAQUE' | 'BLEND';
  extras?: {
    /** planks: rows `size[0]` wide of boards `size[1]` long; tiles: squares; bricks: `size[0]` × `size[1]`; speckled, marble: a repeat */
    pattern?: MaterialPattern;
    /** Size of the pattern, mm: one number or [w, h] */
    size?: number | [number, number];
    /** Seams, grout, joints, speckles or veins */
    color2?: RGBA;
    /** A second speckle colour, or a marble's grout */
    color3?: RGBA;
    /** speckled: how many speckles per repeat, their radius range and the seed placing them */
    count?: number;
    radius?: [number, number];
    seed?: number;
  };
}

const rgba = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
export const materialSchema: z.ZodType<Material> = z.object({
  name: namesSchema,
  pbrMetallicRoughness: z.object({
    baseColorFactor: rgba,
    metallicFactor: z.number().min(0).max(1).optional(),
    roughnessFactor: z.number().min(0).max(1).optional(),
  }),
  alphaMode: z.enum(['OPAQUE', 'BLEND']).optional(),
  extras: z
    .object({
      pattern: z.enum(MATERIAL_PATTERNS).optional(),
      size: z.union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])]).optional(),
      color2: rgba.optional(),
      color3: rgba.optional(),
      count: z.number().int().min(0).max(1000).optional(),
      radius: z.tuple([z.number().positive(), z.number().positive()]).optional(),
      seed: z.number().int().optional(),
    })
    .optional(),
});
