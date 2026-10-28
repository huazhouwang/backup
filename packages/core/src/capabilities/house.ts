/** Generating a whole house from a room program (issue 187): the options to choose from, and building the chosen one. */
import { z } from 'zod';
import { buildHouse, houseOptions, ROOM_TYPES, TYPOLOGIES, type HouseProgram } from '../generate/index.js';
import { text } from '../i18n.js';
import { defineEdit, defineRead } from './capability.js';

const zProgram = z.object({
  floors: z.number().int().min(1).max(3).describe('Storeys above ground'),
  rooms: z
    .array(
      z.object({
        type: z.enum(ROOM_TYPES),
        name: z.string().optional().describe('Name to write into the design, in the language the project data uses; default: the type'),
        area: z.number().positive().optional().describe('Target net area, m²'),
        floor: z.number().int().min(0).max(2).optional().describe('0 = ground floor; omit to let the generator choose'),
      }),
    )
    .describe('Rooms wanted. Missing essentials (living room, kitchen, a bedroom, a bathroom per storey with bedrooms) are added'),
  plot: z
    .object({ width: z.number().positive(), depth: z.number().positive() })
    .optional()
    .describe('Buildable area on the plot (mm), east-west by north-south'),
  storeyHeight: z.number().min(2600).max(4500).optional().describe('mm, default 3000'),
});

export const houseOptionsCap = defineRead({
  name: 'house_options',
  title: 'House options',
  description:
    'Generate 2–3 different whole-house layouts from a room program (typologies: bar = a corridor between a sunny south band and a service band; hall = a central living hall through the depth with a wing either side; courtyard = one storey around a courtyard). Each option lists its footprint, gross area and every room with target and built area. Deterministic. Show the options to the owner and let them pick, then call house_build with the picked id.',
  input: z.object({ program: zProgram }),
  run: (i, { session }) => {
    const { program, options } = houseOptions(i.program as HouseProgram, session.project.language);
    return {
      program,
      options: options.map(({ project: _p, ...o }) => o),
    };
  },
});

export const houseBuild = defineEdit({
  name: 'house_build',
  title: 'Build house',
  permission: 'main',
  description:
    "Replace the design's building (storeys, walls, rooms, doors and windows, stairs, furniture) with the house option picked from house_options, built from the same program. The site, brief, decisions, looks and widgets stay. Undoable.",
  input: z.object({ program: zProgram, option: z.string().describe(`An option id from house_options: ${TYPOLOGIES.join(', ')}, optionally with -mirrored`) }),
  label: i => text('log_house_build', 'Build house ({option})', { option: i.option }),
  apply: (p, i) => {
    const { program, layout } = buildHouse(p, i.program as HouseProgram, i.option);
    return { option: i.option, width: layout.width / 1000, depth: layout.depth / 1000, floors: program.floors, rooms: program.rooms.map(r => r.name) };
  },
  examples: [
    {
      input: {
        program: { floors: 2, rooms: [{ type: 'living' }, { type: 'kitchen' }, { type: 'elder' }, { type: 'master' }, { type: 'kids' }] },
        option: 'bar',
      },
      note: 'Build the bar option for a three-generation family: elders downstairs, parents and child upstairs',
    },
  ],
});
