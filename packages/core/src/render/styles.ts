/**
 * Style presets (issue 195): the styles a design can be rendered in, as data (libraries/styles.json, format in
 * libraries/styles.schema.json). The image model gets the style's words for outside or inside, around a common instruction that
 * keeps the building as it is: the passes rendered from the model carry the geometry, the words carry the style.
 */
import { z } from 'zod';
import stylesFile from '../../../../libraries/styles.json' with { type: 'json' };
import type { Names } from '../looks/material.js';

export interface StylePreset {
  id: string;
  name: Required<Names>;
  /** Other keys it is known by (the brief records styles as modern, chinese, nordic…) */
  aliases?: string[];
  /** The style outside: facade, roof, landscape (English) */
  exterior: string;
  /** The style inside: surfaces, furniture, light (English) */
  interior: string;
  /** What to avoid, besides the common negative prompt */
  negative?: string;
  /** Its main colours, lightest first (#rrggbb) */
  palette: string[];
}

const zStyle = z
  .object({
    id: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .max(64),
    name: z.object({ zh: z.string().min(1), en: z.string().min(1) }).strict(),
    aliases: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)).optional(),
    exterior: z.string().min(1),
    interior: z.string().min(1),
    negative: z.string().optional(),
    palette: z
      .array(z.string().regex(/^#[0-9a-f]{6}$/))
      .min(2)
      .max(6),
  })
  .strict();

export const zStylesFile = z
  .object({ $schema: z.string().optional(), format: z.literal('opensu-styles'), formatVersion: z.literal(1), styles: z.array(zStyle).min(1) })
  .strict()
  .refine(f => new Set(f.styles.map(s => s.id)).size === f.styles.length, 'style ids must be unique');

export const STYLE_PRESETS: StylePreset[] = zStylesFile.parse(stylesFile).styles;

/** A preset by its id or one of its aliases */
export const stylePreset = (key: string) => STYLE_PRESETS.find(s => s.id === key) ?? STYLE_PRESETS.find(s => s.aliases?.includes(key));

/** A style asked for in words instead of a preset */
export const customStyle = (words: string): StylePreset => ({
  id: 'custom',
  name: { zh: words, en: words },
  exterior: words,
  interior: words,
  palette: ['#f2f1ee', '#3b3a38'],
});

/** What every render keeps: the building as modelled. Image models follow positive instructions better than lists of don'ts. */
const KEEP =
  'Photorealistic architectural visualization of exactly this design. Keep the camera, the geometry, the proportions, every wall, door, window and opening, the room layout and the furniture positions exactly as in the input image; change only materials, finishes, furniture styling, decoration, lighting and planting.';
const NEGATIVE =
  'extra floors, extra windows, moved walls, changed layout, distorted perspective, people, text, watermark, logo, cartoon, sketch, low quality, blurry';

/** The prompt for a shot: the common instruction plus the style's words for outside or inside */
export function stylePrompt(style: StylePreset, inside: boolean): { prompt: string; negative: string } {
  return {
    prompt: `${KEEP} Style: ${inside ? style.interior : style.exterior}. Natural daylight, high detail, 35mm lens look.`,
    negative: style.negative ? `${NEGATIVE}, ${style.negative}` : NEGATIVE,
  };
}
