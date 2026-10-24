/** Relations: constraints, brief and decisions. */
import { z } from 'zod';
import { defineEdit } from './capability.js';
import { SUPPORTED_CONSTRAINTS } from '../rules/constraints.js';
import { nextId } from '../geometry/topology.js';
import { text } from '../i18n.js';
import { findAny, resolve } from '../model/refs.js';

export const constraintAdd = defineEdit({
  name: 'constraint_add',
  title: 'Add constraint',
  kind: 'relation',
  description: [
    'Store a relationship stated by the owner as a constraint, maintained automatically on later edits. Supported: ',
    'align (targets: several parallel walls, kept collinear); ',
    "center (targets: [opening, space]; the opening is centred on that space's segment of the wall); ",
    'spacing (targets: [opening or wall, wall], params.distance in mm: clear distance from the opening edge to the wall face, or centre-to-centre distance of two parallel walls); ',
    'size-target (targets: [space, optional wall], params.area in m², params.tolerance default 0.3). ',
    'With hard=true, violating operations are rejected. source: user if the owner said it, agent if you inferred it.',
  ].join(''),
  input: z.object({
    type: z.enum(SUPPORTED_CONSTRAINTS),
    targets: z.array(z.string()).min(1).describe('Object IDs or names'),
    params: z.record(z.string(), z.unknown()).default({}),
    hard: z.boolean().default(false),
    source: z.enum(['user', 'agent', 'default']).default('user'),
    note: z.string().optional().describe("Record in the owner's own words"),
  }),
  label: i => text('log_constraint_add', 'Add constraint: {note}', { note: i.note ?? i.type }),
  apply: (p, i) => {
    const targets = i.targets.map(t => findAny(p, t));
    const c = {
      id: nextId(p, 'c-'),
      type: i.type,
      targets,
      params: i.params,
      hard: i.hard,
      source: i.source,
      weight: i.source === 'user' ? 3 : i.source === 'agent' ? 2 : 1,
      ...(i.note ? { note: i.note } : {}),
    };
    p.constraints.push(c);
    return { id: c.id };
  },
  examples: [
    { input: { type: 'center', targets: ['主卧南墙·门', '主卧'], note: '门在房间中线上' }, note: 'Centre a door' },
    { input: { type: 'size-target', targets: ['老人房一'], params: { area: 12 }, note: '老人房一约 12 平' }, note: 'Area target' },
  ],
});

export const constraintRemove = defineEdit({
  name: 'constraint_remove',
  title: 'Delete constraint',
  kind: 'relation',
  description: 'Delete a constraint.',
  input: z.object({ constraint: z.string() }),
  label: i => text('log_constraint_remove', 'Delete constraint {id}', { id: i.constraint }),
  apply: (p, i) => {
    const id = resolve(p, 'constraint', i.constraint).id;
    p.constraints = p.constraints.filter(c => c.id !== id);
    return { removed: id };
  },
});

export const briefUpdate = defineEdit({
  name: 'brief_update',
  title: 'Record brief',
  kind: 'relation',
  description: "Record or update the owner's brief: household members, room list, preferences, budget, notes. Array fields are replaced wholesale.",
  input: z.object({
    household: z.array(z.string()).optional(),
    rooms: z.array(z.string()).optional(),
    preferences: z.array(z.string()).optional(),
    budget: z.string().optional(),
    notes: z.array(z.string()).optional(),
  }),
  label: () => text('log_brief_update', 'Update brief'),
  apply: (p, i) => {
    p.brief = { ...p.brief, ...Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) };
    return p.brief;
  },
});

export const decisionAdd = defineEdit({
  name: 'decision_add',
  title: 'Record decision',
  kind: 'relation',
  description: 'Write a trade-off to the decision log: what was done, why, and which options were rejected.',
  input: z.object({ summary: z.string(), reason: z.string().optional(), rejected: z.array(z.string()).optional() }),
  label: i => text('log_decision_add', 'Record decision: {summary}', { summary: i.summary }),
  apply: (p, i) => {
    const d = { id: nextId(p, 'd-'), at: new Date().toISOString(), ...i };
    p.decisions.push(d);
    return { id: d.id };
  },
});
