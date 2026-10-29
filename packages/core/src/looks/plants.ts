/**
 * Image plants (issue 214): plants as cut-outs with alpha, the way SketchUp's face-me plants and Enscape's or Lumion's billboards
 * draw them, built in like the texture sets (libraries/plants.json, format in libraries/plants.schema.json; images in
 * libraries/plants/<id>/, rendered from CC0 models by scripts/plants.mjs). A look draws one with `$plant(id, at, h)`: crossed
 * views in 3D that cast leaf shadows, the view from above in the plan. Library files carry the id, never a path.
 */
import { z } from 'zod';
import plantsFile from '../../../../libraries/plants.json' with { type: 'json' };
import { namesSchema, type Names } from './material.js';

/** What a cut-out is: plants by their role in a planting plan, and people (scale figures, drawn facing the camera) */
export const PLANT_KINDS = ['tree', 'shrub', 'ground', 'potted', 'person'] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];

export interface Plant {
  name: Names;
  /** What it is in a planting plan */
  kind: PlantKind;
  source: {
    polyhaven?: string;
    node?: number | string;
    patch?: { nodes: number[]; count: number; radius: number };
    url?: string;
    authors?: string[];
    license?: string;
  };
  /** The plant's real size, mm */
  size: { w: number; d: number; h: number };
  /** Paths under libraries/plants/: seen from the front (looking north), the side (looking west) and above */
  views: { front: string; side: string; top: string };
}

const positive = z.number().positive();
const plantSchema: z.ZodType<Plant> = z.object({
  name: namesSchema,
  kind: z.enum(PLANT_KINDS),
  source: z.object({
    polyhaven: z.string().optional(),
    node: z.union([z.number().int(), z.string()]).optional(),
    patch: z.object({ nodes: z.array(z.number().int()), count: z.number().int(), radius: positive }).optional(),
    zip: z.string().optional(),
    file: z.string().optional(),
    pose: z.object({ animation: z.string(), time: z.number().optional(), yaw: z.number().optional(), height: positive }).optional(),
    url: z.string().optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
  }),
  size: z.object({ w: positive, d: positive, h: positive }),
  views: z.object({ front: z.string(), side: z.string(), top: z.string() }),
});

const catalogSchema = z.object({ format: z.literal('opensu-plants'), formatVersion: z.literal(1), plants: z.record(z.string(), plantSchema) });

/** Every built-in plant, by id */
export const PLANTS: Record<string, Plant> = catalogSchema.parse(plantsFile).plants;

/** A plant drawn `h` mm tall: its width and depth keep the plant's proportions */
export const plantSpread = (p: Plant, h: number) => ({ w: (p.size.w * h) / p.size.h, d: (p.size.d * h) / p.size.h });
