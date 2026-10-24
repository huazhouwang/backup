/** Zod fragments shared by capability inputs. Their descriptions are part of what the agent sees. */
import { z } from 'zod';
import { OPENING_KINDS, SPACE_KINDS, WALL_KINDS, type Point } from '../model/schema.js';

export const zRef = (what: string) => z.string().describe(`ID or name of the ${what} (names may take a level prefix, e.g. “Level 2·Bedroom” or “二层·主卧”)`);
export const zPoint = z.tuple([z.number(), z.number()]).describe('[x, y] in mm; x points east, y points south');
export const zRect = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .describe('[x, y, width (east-west), depth (north-south)] in mm; x, y is the north-west corner');
export const zDirection = z.enum(['north', 'south', 'east', 'west']).describe('Direction: north / south / east / west');
export const zWallKind = z.enum(WALL_KINDS);
export const zSpaceKind = z.enum(SPACE_KINDS);
export const zOpeningKind = z.enum(OPENING_KINDS);

export const DIR_VEC: Record<z.infer<typeof zDirection>, Point> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
export const zShape = { rect: zRect.optional(), polygon: z.array(zPoint).optional().describe('Vertices of an arbitrary polygon (in order)') };
