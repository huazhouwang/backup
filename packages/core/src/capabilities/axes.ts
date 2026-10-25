/**
 * Moving and turning the model axes (see Axes in schema.ts), as SketchUp's Axes tool: people drag them in the plan; drawing and
 * snapping follow them, while every position (and every coordinate the agent reads or writes) stays in world coordinates.
 */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { text } from '../i18n.js';
import { normalAngle } from '../geometry/axes.js';
import { zPoint } from './inputs.js';

export const axesSet = defineEdit({
  name: 'axes_set',
  title: 'Move the axes',
  description:
    'Move or turn the model axes people draw and place along: origin a plan point, angle the red axis clockwise from east (degrees); reset: true puts them back on the world axes. Coordinates in every capability stay world coordinates.',
  input: z.object({ origin: zPoint.optional(), angle: z.number().optional(), reset: z.boolean().default(false) }),
  label: i => (i.reset ? text('log_axes_reset', 'Reset the axes') : text('log_axes_set', 'Move the axes')),
  apply: (p, i) => {
    if (i.reset) {
      delete p.axes;
      return {};
    }
    const now = p.axes ?? { origin: [0, 0], angle: 0 };
    const axes = {
      origin: (i.origin ? [Math.round(i.origin[0]), Math.round(i.origin[1])] : now.origin) as [number, number],
      angle: Math.round(normalAngle(i.angle ?? now.angle) * 100) / 100,
    };
    if (!axes.angle && !axes.origin[0] && !axes.origin[1]) delete p.axes;
    else p.axes = axes;
    return { axes: p.axes ?? null };
  },
});
