/** Query and verify capabilities: read-only views of the project. */
import { z } from 'zod';
import { DEFAULT_MATERIALS } from '../looks/builtin.js';
import { nameIn } from '../looks/material.js';
import { defineRead } from './capability.js';
import { derived } from '../model/derived.js';
import { projectIndex } from '../model/project-index.js';
import { findAny, resolveLevel, type Kind } from '../model/refs.js';
import { r2, objectInfo } from '../model/info.js';

export const projectSummary = defineRead({
  name: 'project_summary',
  title: 'Project overview',
  description: 'Project name, levels, gross area per level, object counts, brief and constraint overview. Call this before starting work.',
  input: z.object({}),
  run: (_, { session }) => {
    const p = session.project;
    const rep = derived(p).areas;
    return {
      name: p.name,
      levels: p.levels.map(l => ({
        id: l.id,
        name: l.name,
        elevation: l.elevation,
        height: l.height,
        roof: !!l.roof,
        gross: r2(rep.levels.find(x => x.id === l.id)!.gross),
        spaces: p.spaces.filter(s => s.level === l.id).map(s => s.name),
      })),
      totalGross: r2(rep.totalGross),
      counts: { walls: p.walls.length, spaces: p.spaces.length, furniture: p.furniture.length, elements: p.elements.length, constraints: p.constraints.length },
      brief: p.brief,
      site: { boundary: p.site.boundary },
      furnitureTypes: Object.fromEntries(Object.entries(p.library.furniture).map(([k, v]) => [k, v.name])),
      // Materials for floors, wall finishes and looks: the default library's and the design's own
      materials: Object.fromEntries(Object.entries({ ...DEFAULT_MATERIALS, ...p.library.materials }).map(([k, v]) => [k, nameIn(v.name, p.language)])),
      // The design's own looks (beyond the default set) and which target uses which
      looks: Object.fromEntries(Object.entries(p.library.looks ?? {}).map(([k, v]) => [k, { name: v.name, for: v.for }])),
      lookUse: p.library.use ?? {},
    };
  },
});

export const findObjects = defineRead({
  name: 'find_objects',
  title: 'Find objects',
  description: 'Search walls, spaces, openings, furniture and elements by name keyword, type and level. Returns ID, name, type and level.',
  input: z.object({
    query: z
      .string()
      .optional()
      .describe('Name keyword in the language the project data uses, e.g. “Bedroom”, “north wall”, “Window” (or “老人房”, “北墙”, “窗”)'),
    type: z.enum(['wall', 'space', 'opening', 'furniture', 'element', 'level', 'constraint']).optional(),
    level: z.string().optional().describe('Level ID or name'),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  run: ({ query, type, level, limit }, { session }) => {
    const p = session.project;
    const lv = level ? resolveLevel(p, level).id : undefined;
    const kinds: Kind[] = type ? [type] : ['space', 'wall', 'opening', 'furniture', 'element', 'level', 'constraint'];
    return kinds
      .flatMap(k =>
        projectIndex(p)
          .of(k)
          .map(o => ({ id: o.id, name: o.name, type: k, level: o.level })),
      )
      .filter(o => (!lv || o.level === lv) && (!query || o.name.includes(query) || o.id === query))
      .slice(0, limit);
  },
});

export const getObject = defineRead({
  name: 'get_object',
  title: 'View object',
  description:
    'Get details of one object. Space: usable area, bounds, surrounding walls and their directions, neighboring spaces, furniture. Wall: endpoints, length, thickness, spaces on each side, openings. Opening: host wall, position, connected spaces.',
  input: z.object({ ref: z.string().describe('Object ID or name') }),
  run: ({ ref }, { session }) => objectInfo(session.project, findAny(session.project, ref)),
});

export const areaReportCap = defineRead({
  name: 'area_report',
  title: 'Area report',
  description: 'Gross area per level and usable area per space (m²).',
  input: z.object({ level: z.string().optional() }),
  run: ({ level }, { session }) => {
    const p = session.project;
    const lv = level ? resolveLevel(p, level).id : undefined;
    const rep = derived(p).areas;
    return {
      levels: rep.levels.filter(l => !lv || l.id === lv).map(l => ({ ...l, gross: r2(l.gross), spaces: l.spaces.map(s => ({ ...s, net: r2(s.net) })) })),
      totalGross: r2(rep.totalGross),
    };
  },
});

export const checkRulesCap = defineRead({
  name: 'check_rules',
  title: 'Rule check',
  kind: 'verify',
  description:
    'Check for overlapping rooms, openings beyond the wall or overlapping, rooms without an entrance, bedrooms without a window, door leaves hitting furniture, furniture outside any space, and whether constraints are satisfied.',
  input: z.object({}),
  run: (_, { session }) => ({
    issues: derived(session.project).rules,
    constraints: derived(session.project).constraints.filter(c => !c.ok),
  }),
});

export const listConstraints = defineRead({
  name: 'list_constraints',
  title: 'Constraints',
  description: 'List all constraints and whether each is satisfied.',
  input: z.object({}),
  run: (_, { session }) => {
    const st = new Map(derived(session.project).constraints.map(s => [s.id, s]));
    return session.project.constraints.map(c => ({ ...c, ok: st.get(c.id)?.ok, status: st.get(c.id)?.message }));
  },
});
