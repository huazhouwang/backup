/** The single capability registry shared by the UI, the agent and window.artifact.call */
import { createRegistry } from '@plinth/core';
import { LIBRARY_CAPABILITIES } from './library-capabilities';
import { LOOK_CAPABILITIES } from './look-capabilities';
import { VIEW_CAPABILITIES } from './view-capabilities';

export const registry = createRegistry([...VIEW_CAPABILITIES, ...LOOK_CAPABILITIES, ...LIBRARY_CAPABILITIES]);
