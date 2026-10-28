/**
 * Selection and change feedback. Color carries the state (see Plan2D and Model3D): selected objects stay tinted until
 * deselected, changed objects get a tint that fades out. Motion is a one-time cue only: in 3D a newly selected object
 * hops once (it helps find objects behind walls); nothing repeats, and the plan doesn't hop at all.
 * Feel by weight: load-bearing walls hop low and land heavy, partitions and railings are light, furniture lightest.
 */
import { findObject, levelStack, roofs, type Project } from '@opensu/core';

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

/**
 * A house just built goes up storey by storey (issue 188): within a storey its floor, then its walls, the stair, doors and
 * windows, furniture; roofs last. Seconds from the start; each part grows for DURATION.
 */
export const BUILD = { storey: 1.2, walls: 0.2, elements: 0.4, openings: 0.7, furniture: 1.0, roof: 1.2, duration: 0.8 };
/** The key a roof grows under (it shares its room's id) */
export const roofKey = (space: string) => `roof:${space}`;

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
  /** A build-up playing: when it started, and when each object starts growing (seconds after) */
  private building: { at: number | null; start: Map<string, number>; end: number } | null = null;
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

  /** Play the build-up for a house just built (nothing with reduced motion) */
  build(p: Project) {
    if (this.reduced) return;
    const storey = new Map(
      levelStack(p)
        .filter(l => !l.roof)
        .map((l, i) => [l.id, i * BUILD.storey]),
    );
    const start = new Map<string, number>();
    const at = (level: string, offset: number) => (storey.get(level) ?? 0) + offset;
    for (const s of p.spaces) start.set(s.id, at(s.level, 0));
    for (const w of p.walls) {
      start.set(w.id, at(w.level, BUILD.walls));
      for (const o of w.openings) start.set(o.id, at(w.level, BUILD.openings));
    }
    for (const e of p.elements) start.set(e.id, at(e.level, BUILD.elements));
    for (const f of p.furniture) start.set(f.id, at(f.level, BUILD.furniture));
    for (const r of roofs(p)) start.set(roofKey(r.space), at(p.spaces.find(s => s.id === r.space)?.level ?? '', BUILD.roof));
    const end = Math.max(0, ...start.values()) + BUILD.duration;
    // Everything waits hidden until the 3D view is on screen (startBuild): it may still be loading behind the plan
    this.building = { at: null, start, end };
  }

  /** A build-up is waiting to start: entering 3D, the house doesn't rise out of the plan as a whole (the build-up does it) */
  get buildPending() {
    return !!this.building && this.building.at == null;
  }

  /** A build-up is waiting or playing */
  get buildActive() {
    return !!this.building;
  }

  /** The 3D view is on screen: the build-up's clock starts */
  startBuild(now = performance.now()) {
    if (this.building && this.building.at == null) this.building.at = now;
  }

  /** How far up an object is in the build-up right now: 0 not yet, 1 standing (also when nothing is playing) */
  grow(key: string, now: number) {
    const b = this.building;
    if (!b) return 1;
    if (b.at == null) return b.start.has(key) ? 0 : 1;
    const t = (now - b.at) / 1000;
    if (t > b.end) {
      this.building = null;
      return 1;
    }
    const s = b.start.get(key);
    if (s == null) return 1;
    const k = Math.min(1, Math.max(0, (t - s) / BUILD.duration));
    // Ease out: quick to rise, settling gently
    return 1 - (1 - k) ** 3;
  }

  stop() {
    this.selected = [];
    this.recent.clear();
    this.changed.clear();
  }
}

export const hops = new Hops();
