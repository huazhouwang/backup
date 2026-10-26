/**
 * The canvas page for the agent (issue 171): the wheels' reference, read before writing a module (canvas_module_put). Runs in the
 * browser; the server only uses the definition to describe the tool.
 */
import { defineRead } from '@plinth/core';
import { z } from 'zod';
import { WHEELS_DOC } from '@/wheels/docs';

export const canvasWheels = defineRead({
  name: 'canvas_wheels',
  title: 'Read canvas wheels',
  kind: 'query',
  permission: 'read',
  runtime: 'any',
  description:
    'The reference for writing canvas modules: what a module receives (canvas), every wheel (bridge, data, plan view, selectable, draggable, snaps, the wall tool, toolbar) and an example. Read it before canvas_module_put, and use the wheels instead of rewriting them.',
  input: z.object({}),
  run: () => ({ doc: WHEELS_DOC }),
});

export const CANVAS_CAPABILITIES = [canvasWheels];
