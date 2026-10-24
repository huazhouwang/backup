/** Built-in capabilities: query, edit, relation, verify. Browser-only view capabilities are registered at runtime. */
import { Registry, type Capability } from './capability.js';
import { areaReportCap, checkRulesCap, findObjects, getObject, listConstraints, projectSummary } from './query.js';
import { wallAdd, wallMove, wallRemove, wallUpdate } from './wall.js';
import { openingAdd, openingRemove, openingUpdate } from './opening.js';
import { roomAdd, spaceAdd, spaceMerge, spaceRemove, spaceSetArea, spaceUpdate } from './space.js';
import { furnitureAdd, furnitureMove, furnitureRemove } from './furniture.js';
import { levelAdd, levelRemove, levelUpdate } from './level.js';
import { briefUpdate, constraintAdd, constraintRemove, decisionAdd } from './relation.js';
import { historyLog, historyRedo, historyUndo } from './history.js';
import { batchCapability, searchCapabilitiesFor } from './meta.js';
import { furnitureTypeAdd, lookAdd, lookGet, lookImport, lookRemove, lookSet, lookUpdate, lookUse, paramsSet } from './look.js';

export * from './query.js';
export * from './wall.js';
export * from './opening.js';
export * from './space.js';
export * from './furniture.js';
export * from './level.js';
export * from './relation.js';
export * from './history.js';
export * from './meta.js';
export * from './look.js';
export { resolve, resolveLevel } from '../model/refs.js';
export { objectInfo, type ObjectInfo } from '../model/info.js';

export const BUILTIN: Capability[] = [
  projectSummary,
  findObjects,
  getObject,
  areaReportCap,
  checkRulesCap,
  listConstraints,
  wallAdd,
  wallMove,
  wallUpdate,
  wallRemove,
  openingAdd,
  openingUpdate,
  openingRemove,
  roomAdd,
  spaceAdd,
  spaceUpdate,
  spaceRemove,
  spaceMerge,
  spaceSetArea,
  furnitureAdd,
  furnitureMove,
  furnitureRemove,
  levelAdd,
  levelUpdate,
  levelRemove,
  constraintAdd,
  constraintRemove,
  briefUpdate,
  decisionAdd,
  historyUndo,
  historyRedo,
  historyLog,
  lookGet,
  lookAdd,
  lookUpdate,
  lookRemove,
  lookUse,
  lookSet,
  lookImport,
  paramsSet,
  furnitureTypeAdd,
];

/** Built-in capability registry (including batch and search_capabilities) */
export function createRegistry(extra: Capability[] = []): Registry {
  const r = new Registry([...BUILTIN, ...extra]);
  r.register(batchCapability(r));
  r.register(searchCapabilitiesFor(r));
  return r;
}
