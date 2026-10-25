/**
 * Moving the model axes' origin (see Axes in schema.ts): people drag it on the ground in 3D; the axes stay square to the world. Every
 * coordinate the agent reads or writes stays a world coordinate.
 */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { text } from '../i18n.js';
import { zPoint } from './inputs.js';

export const axesSet = defineEdit({
  name: 'axes_set',
  title: 'Move the axes',
  description:
    "Move the model axes' origin to a plan point on the ground (the axes stay x east, y south, z up); reset: true puts it back on the house's top-left corner. Coordinates in every capability stay world coordinates.",
  input: z.object({ origin: zPoint.optional(), reset: z.boolean().default(false) }),
  label: i => (i.reset ? text('log_axes_reset', 'Reset the axes') : text('log_axes_set', 'Move the axes')),
  apply: (p, i) => {
    if (i.reset || !i.origin) {
      delete p.axes;
      return {};
    }
    p.axes = { origin: [Math.round(i.origin[0]), Math.round(i.origin[1])] };
    return { axes: p.axes };
  },
});
