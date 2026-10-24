/** Undo, redo and the operation log. */
import { z } from 'zod';
import { defineRead, defineSession } from './capability.js';

export const historyUndo = defineSession({
  name: 'history_undo',
  title: 'Undo',
  description: 'Undo the last change.',
  input: z.object({}),
  run: (_, { session }) => {
    const e = session.undo();
    return e ? { undone: e.label, changed: e.changed } : { undone: null };
  },
});

export const historyRedo = defineSession({
  name: 'history_redo',
  title: 'Redo',
  description: 'Redo the change just undone.',
  input: z.object({}),
  run: (_, { session }) => {
    const e = session.redo();
    return e ? { redone: e.label, changed: e.changed } : { redone: null };
  },
});

export const historyLog = defineRead({
  name: 'history_log',
  title: 'Operation log',
  description: 'Operation log for this session: who, when, what and why.',
  input: z.object({ limit: z.number().int().positive().default(20) }),
  run: ({ limit }, { session }) => session.log.slice(-limit),
});
