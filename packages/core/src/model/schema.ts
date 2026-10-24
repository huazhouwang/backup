/**
 * Plinth project data schema v2 (v2 added `language`).
 *
 * Conventions:
 * - Lengths are in millimetres; plan coordinates have x pointing east and y pointing south; heights are measured from each level's base elevation.
 * - Every object has a stable `id` (for programs) and a readable `name` (for people and the agent, e.g. “老人房二西墙”).
 * - Derived results (slabs, roofs, areas, wall junctions) are not stored.
 * - The schema only includes fields already used in real designs with a settled meaning; anything uncertain goes into `extras`
 *   and is promoted to a proper field on its second use. Fields are added, removed or changed via `version` + a migration function (see migrate.ts).
 */

import type { Material } from '../looks/material.js';
import type { Recipe } from '../looks/script.js';

export const SCHEMA = 'plinth/project' as const;
export const SCHEMA_VERSION = 8 as const;

/** Language of the names written into project data (levels, walls, openings, catalog); independent of the UI language */
export type ProjectLanguage = 'zh' | 'en';

export type Id = string;
/** Millimetres */
export type Mm = number;
/** [x, y], millimetres */
export type Point = [Mm, Mm];
/** Closed ring without a repeated end point; outer rings may be clockwise or counter-clockwise */
export type Ring = Point[];
export interface Polygon {
  outer: Ring;
  holes?: Ring[];
}
/** Information not yet in the schema that must be preserved as-is */
export type Extras = Record<string, unknown>;

export interface Project {
  schema: typeof SCHEMA;
  version: typeof SCHEMA_VERSION;
  id: Id;
  name: string;
  /** Language of generated names (level, wall, opening and catalog names); added in v2 */
  language: ProjectLanguage;
  units: 'mm';
  site: Site;
  levels: Level[];
  walls: Wall[];
  spaces: Space[];
  elements: Element[];
  furniture: Furniture[];
  constraints: Constraint[];
  brief: Brief;
  decisions: Decision[];
  library: Library;
  variants: Variant[];
  extras?: Extras;
}

export interface Site {
  /** Site boundary */
  boundary: Ring;
  /** Clockwise angle of true north from the -y axis (degrees); 0 means north is up on the drawing */
  northAngle: number;
  location: { lat: number; lon: number; /** Time zone, hours */ tz: number };
  /** Elevation of outdoor grade relative to the ground-floor level */
  groundLevel: Mm;
  extras?: Extras;
}

export interface Level {
  id: Id;
  name: string;
  /** Base elevation. Levels are a stack (see levels.ts): each level's elevation is the one below's plus its storey height. */
  elevation: Mm;
  /** Storey height, up to the next level; 0 for the roof level, whose walls must specify height */
  height: Mm;
  roof?: boolean;
}

export const WALL_KINDS = ['bearing', 'partition', 'fence', 'parapet', 'railing'] as const;
export type WallKind = (typeof WALL_KINDS)[number];

export interface Wall {
  id: Id;
  name: string;
  level: Id;
  /** Centreline start and end points */
  start: Point;
  end: Point;
  thickness: Mm;
  kind: WallKind;
  /** What its faces are finished with: a material (the design's or the default library's); painted white when absent. Added in v7. */
  finish?: string;
  /** A railing's own look (library.looks), instead of the one for railings. Added in v7. */
  look?: Id;
  /** Values for a railing's look parameters. Added in v7. */
  lookParams?: Record<string, string | number | boolean | null>;
  /**
   * Wall height of its own (BIM's "unconnected height"); without it the wall is attached to the level above, as tall as its
   * storey. A bearing or partition wall may be lower than its storey, but not rise through a slab above it.
   */
  height?: Mm;
  openings: Opening[];
  extras?: Extras;
}

export const OPENING_KINDS = ['door', 'sliding-door', 'gate', 'window', 'opening'] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

export interface Opening {
  id: Id;
  name: string;
  kind: OpeningKind;
  /** Distance from the opening centre to the wall start (along the centreline) */
  at: Mm;
  width: Mm;
  height: Mm;
  /** Height of the opening bottom above the floor */
  sill: Mm;
  /** Swing door: whether the hinge is at the start or end side, and which side of the wall it opens to (looking from start → end, plan north up) */
  swing?: { hinge: 'start' | 'end'; side: 'left' | 'right' };
  glazing?: 'glass-block';
  /** This opening's own look (library.looks), instead of the one for its kind */
  look?: Id;
  /** Values for its look's parameters (the look's defaults for the rest) */
  lookParams?: Record<string, string | number | boolean | null>;
  extras?: Extras;
}

export const SPACE_KINDS = ['indoor', 'semi-outdoor', 'outdoor', 'roof-terrace', 'void'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export interface Space {
  id: Id;
  name: string;
  level: Id;
  kind: SpaceKind;
  /** Region enclosed by axes (wall centrelines); may consist of several parts */
  shape: Polygon[];
  /** Floor material: one of library.materials or the default library's */
  floor: string;
  /** The slab is open here (stairwell, double-height space) */
  slabOpening?: boolean;
  extras?: Extras;
}

/** Element instance: stairs, pools, drains, etc.; references a library.elements definition + parameters */
export interface Element {
  id: Id;
  name: string;
  type: string;
  level: Id;
  /** Top level of a multi-level element */
  topLevel?: Id;
  params: Record<string, unknown>;
  /** This element's own look (library.looks), instead of the one for its type */
  look?: Id;
  /** Values for its look's parameters (the look's defaults for the rest) */
  lookParams?: Record<string, string | number | boolean | null>;
  extras?: Extras;
}

export interface Furniture {
  id: Id;
  name: string;
  /** Furniture category, see library.furniture */
  type: string;
  level: Id;
  /** Centre point */
  position: Point;
  /** Clockwise rotation about the centre (degrees, plan north up) */
  rotation: number;
  size: { w: Mm; d: Mm; h: Mm };
  /** Height above the floor (wall-mounted, suspended) */
  elevation?: Mm;
  /** This piece's own look (library.looks), instead of the one for its type */
  look?: Id;
  /** Values for its look's parameters (the look's defaults for the rest) */
  lookParams?: Record<string, string | number | boolean | null>;
  extras?: Extras;
}

export const CONSTRAINT_TYPES = ['align', 'center', 'size-target', 'spacing', 'reference', 'rule'] as const;
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/** Constraints: placeholder in v1; solving is roadmap step 3 */
export interface Constraint {
  id: Id;
  type: ConstraintType;
  targets: Id[];
  params: Record<string, unknown>;
  hard: boolean;
  source: 'user' | 'agent' | 'default';
  weight?: number;
  note?: string;
}

export interface Brief {
  household?: string[];
  rooms?: string[];
  preferences?: string[];
  budget?: string;
  notes?: string[];
}

export interface Decision {
  id: Id;
  at: string;
  summary: string;
  reason?: string;
  rejected?: string[];
}

export interface Library {
  furniture: Record<string, { name: string; group?: string; size: { w: Mm; d: Mm; h: Mm } }>;
  /**
   * Materials of this design's own, beyond the default library's (looks/builtin.ts): floors, wall finishes and looks find a
   * material here first. Until v7, the floor material catalog.
   */
  materials: Record<string, Material>;
  elements: Record<string, { name: string; version: number; note?: string }>;
  /**
   * Looks this design uses beyond the default set (looks/), like fonts embedded in a document: everyone who opens the design
   * sees them. Added in v4.
   */
  looks?: Record<Id, Look>;
  /** The look each target uses in this design, instead of the default: 'furniture:sofa3' → a look ID. Added in v4. */
  use?: Record<string, Id>;
}

/** A look: a recipe and the targets it can draw */
export interface Look {
  name: string;
  /** Targets it fits: 'furniture:<type>', 'opening:<kind>' (or 'opening:glass-block'), 'element:<type>', 'wall:railing' */
  for: string[];
  recipe: Recipe;
  /** Bumped on every change */
  version: number;
  /** Where it was copied from: a look in a library, at a version (semver; a number before v7) */
  source?: { library: string; look: string; version: string };
}

export interface Variant {
  id: Id;
  name: string;
  /** Changes relative to the main line; format TBD */
  changes: unknown[];
}
