/**
 * Levels as BIM tools treat them: datums stacked one on another. A storey is the span from a level to the next, so a level's
 * elevation follows from the one below it (its elevation plus its storey height): raising a storey moves every level above, and
 * levels never leave a gap or overlap. The lowest level keeps its own elevation; the roof level has no storey height.
 */
import type { Id, Level, Project } from './schema.js';

/** Thickness of a floor slab (mm): the clear height of a storey is its height less the slab of the floor above */
export const SLAB_THICKNESS = 120;

/** The levels from the lowest up */
export const levelStack = (p: Pick<Project, 'levels'>) => [...p.levels].sort((a, b) => a.elevation - b.elevation);

/** The level directly above this one, if any */
export function levelAbove(p: Pick<Project, 'levels'>, id: Id): Level | undefined {
  const stack = levelStack(p);
  return stack[stack.findIndex(l => l.id === id) + 1];
}

/** Put every level's elevation on the one below it (its elevation plus its storey height), keeping the levels' order */
export function restackLevels(p: Pick<Project, 'levels'>) {
  const stack = levelStack(p);
  for (let i = 1; i < stack.length; i++) stack[i].elevation = stack[i - 1].elevation + stack[i - 1].height;
}

/** Whether the levels are a stack: each level's elevation is the one below's plus its storey height (to the millimetre) */
export const levelsStacked = (p: Pick<Project, 'levels'>) =>
  levelStack(p).every((l, i, s) => i === 0 || Math.abs(l.elevation - (s[i - 1].elevation + s[i - 1].height)) < 1);

/**
 * Storey heights that put the levels on a stack without moving any of them: each storey reaches the level above (for data
 * saved before levels were a stack, whose heights and elevations could disagree); the top level keeps its height
 */
export function heightsFromElevations(levels: Level[]): Level[] {
  const stack = [...levels].sort((a, b) => a.elevation - b.elevation);
  return levels.map(l => {
    const next = stack[stack.indexOf(l) + 1];
    return next && !l.roof ? { ...l, height: next.elevation - l.elevation } : l;
  });
}
