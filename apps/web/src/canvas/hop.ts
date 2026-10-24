/**
 * Selection and change feedback. Color carries the state (see Plan2D and Model3D): selected objects stay tinted until
 * deselected, changed objects get a tint that fades out. Motion is a one-time cue only: in 3D a newly selected object
 * hops once (it helps find objects behind walls); nothing repeats, and the plan doesn't hop at all.
 * Feel by weight: load-bearing walls hop low and land heavy, partitions and railings are light, furniture lightest.
 */
import { findObject, type Project } from '@plinth/core';

export type Weight = 'heavy' | 'light' | 'furniture' | 'floor';

/** lift: 3D hop height in screen pixels (equally visible at any camera distance); ms: hop duration */
export const PROFILE: Record<Weight, { lift: number; ms: number }> = {
  heavy: { lift: 12, ms: 560 },
  light: { lift: 18, ms: 460 },
  furniture: { lift: 22, ms: 420 },
  floor: { lift: 10, ms: 560 },
};

/** How long the camera takes to turn to a hidden selected object */
export const REVEAL = { ms: 600 };

/** How long the tint on changed objects takes to fade out */
export const CHANGE_FADE_MS = 2000;

/** 0→1→0: take off, land with one small rebound; exactly 0 for t≥1 */
export function hopCurve(t: number) {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.72) return Math.sin((Math.PI * t) / 0.72);
  return 0.12 * Math.sin((Math.PI * (t - 0.72)) / 0.28);
}

interface Hop {
  id: string;
  at: number;
  weight: Weight;
}

/** Object weight, and for doors/windows their wall (in 3D they are part of the wall) */
function describe(project: Project, id: string): { weight: Weight; wall?: string } | null {
  const e = findObject(project, id);
  switch (e?.kind) {
    case 'wall':
      return { weight: e.obj.kind === 'bearing' ? 'heavy' : 'light' };
    case 'opening':
      return { weight: 'light', wall: e.wall!.id };
    case 'furniture':
      return { weight: 'furniture' };
    case 'space':
      return { weight: 'floor' };
    default:
      return null;
  }
}

class Hops {
  /** Latest hop per object, keyed by ID; 3D looks it up by ID every frame */
  private recent = new Map<string, Hop>();
  /** When each object was last changed, for the fading tint */
  private changed = new Map<string, number>();
  private selected: string[] = [];
  private project: Project | null = null;
  reduced = false;

  setProject(p: Project) {
    this.project = p;
  }

  private emit(id: string) {
    if (this.reduced || !this.project) return;
    const d = describe(this.project, id);
    if (!d) return;
    const h: Hop = { id, at: performance.now(), weight: d.weight };
    this.recent.set(id, h);
    // In 3D, doors/windows hop with their wall
    if (d.wall) this.recent.set(d.wall, { ...h, id: d.wall, weight: describe(this.project, d.wall)?.weight ?? 'light' });
  }

  /** Selection changed: newly selected objects hop once */
  select(ids: string[]) {
    for (const id of ids) if (!this.selected.includes(id)) this.emit(id);
    this.selected = ids;
  }

  /** Objects were changed (or the agent pointed at them): start their fading tint */
  mark(ids: string[]) {
    const now = performance.now();
    for (const id of ids) {
      this.changed.set(id, now);
      const wall = this.project && describe(this.project, id)?.wall;
      if (wall) this.changed.set(wall, now);
    }
  }

  /** Hop again after the camera turns to reveal a hidden object */
  poke(id: string) {
    this.emit(id);
  }

  /** How many screen pixels an object is lifted right now (0 = at rest); called by 3D every frame */
  lift(id: string, now: number) {
    const h = this.recent.get(id);
    return h ? hopCurve((now - h.at) / PROFILE[h.weight].ms) * PROFILE[h.weight].lift : 0;
  }

  /** Strength of the change tint right now: 1 just after the change, fading to 0 */
  changeTint(id: string, now: number) {
    const at = this.changed.get(id);
    return at == null ? 0 : Math.max(0, 1 - (now - at) / CHANGE_FADE_MS);
  }

  stop() {
    this.selected = [];
    this.recent.clear();
    this.changed.clear();
  }
}

export const hops = new Hops();
