/** The single capability registry shared by the UI, the agent and window.artifact.call */
import { createRegistry } from '@opensu/core';
import { LIBRARY_CAPABILITIES } from './library-capabilities';
import { LOOK_CAPABILITIES } from './look-capabilities';
import { VIEW_CAPABILITIES } from './view-capabilities';
import { CANVAS_CAPABILITIES } from './canvas-capabilities';
import { INTERVIEW_CAPABILITIES } from './interview-capabilities';

export const registry = createRegistry([
  ...VIEW_CAPABILITIES,
  ...LOOK_CAPABILITIES,
  ...LIBRARY_CAPABILITIES,
  ...CANVAS_CAPABILITIES,
  ...INTERVIEW_CAPABILITIES,
]);
