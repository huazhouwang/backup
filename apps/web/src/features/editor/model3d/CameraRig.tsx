import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { hops } from '@/canvas/hop';
import { planFrame } from '@/graphics/plan/plan-geometry';
import { useEditor } from '../store';
import { BIRD, FOV, framed, nearPlane, type Pose } from '@/graphics/three/framing';
import { M } from '@/graphics/three/scene';

export type Orbit = { target: THREE.Vector3; enabled: boolean; update(): void };
/** The last 3D camera per project, so coming back from the plan returns to it */
const lastPose = new Map<string, Pose>();
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * How far each floor has grown at overall progress g (0: flat like the plan, 1: built). The current floor and the ones below rise
 * together first; the floors above follow one after another, each from the top of the one below.
 */
export function floorGrowth(levels: { id: string; elevation: number }[], current: string, g: number) {
  const top = levels.find(l => l.id === current)?.elevation ?? Infinity;
  const n = levels.filter(l => l.elevation > top).length;
  // The upper floors share the last stretch, staggered so the top one finishes exactly at the end
  const each = 0.3,
    step = n > 1 ? (0.45 - each) / (n - 1) : 0;
  let above = 0;
  return levels.map(l => {
    if (l.elevation <= top) return { id: l.id, k: ease(Math.min(1, g / 0.7)), below: true };
    const start = 0.55 + step * above++;
    return { id: l.id, k: ease(THREE.MathUtils.clamp((g - start) / each, 0, 1)), below: false };
  });
}

/**
 * The camera always orbits the middle of the model, so rotating and zooming keep it centered (zoom goes toward that point).
 * Entering 3D starts exactly where the plan was (same framing, straight down, the floor drawing showing the plan) and grows the
 * house out of it while the camera tilts; leaving runs the same in reverse before the plan comes back. Showing other floors
 * (the cutaway) and "fit all" frame the model again from the current direction.
 */
export function CameraRig({
  box,
  levels,
  current,
  growing,
  drawings,
  growth,
  projectId,
}: {
  box: THREE.Box3;
  levels: { id: string; elevation: number }[];
  current: string;
  growing: React.RefObject<Map<string, THREE.Group>>;
  drawings: React.RefObject<Map<string, THREE.Group>>;
  growth: React.RefObject<{ g: number }>;
  projectId: string;
}) {
  const { camera, controls, size, invalidate } = useThree();
  const project = useEditor(s => s.project);
  const setLeave3D = useEditor(s => s.setLeave3D);
  const setPlanUntil3D = useEditor(s => s.setPlanUntil3D);
  const orbit = controls as unknown as Orbit | null;
  const anim = useRef<{ elapsed: number; frames: number; ms: number; from: Pose; to: Pose; grow?: [number, number]; done?: () => void; hold?: number } | null>(
    null,
  );
  const leaving = useRef(false);
  const levelKey = levels.map(l => l.id).join();
  const shownLevels = useRef(levelKey);

  const run = (to: Pose, ms: number, grow?: [number, number], done?: () => void) => {
    if (!orbit) return;
    anim.current = { elapsed: 0, frames: 0, ms: hops.reduced ? 0 : ms, from: { pos: camera.position.clone(), target: orbit.target.clone() }, to, grow, done };
    // The view renders on demand: ask for the first frame, the animation keeps asking until it ends
    invalidate();
  };
  const direction = () => (orbit ? camera.position.clone().sub(orbit.target).normalize() : BIRD);
  const grow = (g: number) => {
    growth.current.g = g;
    for (const { id, k, below } of floorGrowth(levels, current, g)) {
      const group = growing.current.get(id),
        drawing = drawings.current.get(id);
      if (group) {
        group.scale.y = Math.max(k, 0.001);
        group.visible = below || k > 0;
      }
      if (drawing) drawing.visible = below || k > 0;
    }
  };

  /** Straight down at the current floor, framed like the plan (which fits the floor's drawing plus a margin to the view) */
  const planPose = (): Pose => {
    const { x, y, w, h } = planFrame(project, current);
    const visibleH = (w / h > size.width / size.height ? (w * size.height) / size.width : h) * M;
    // The drawing lies just above the floor
    const floor = (levels.find(l => l.id === current)?.elevation ?? 0) * M + 0.006;
    const dist = visibleH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const target = new THREE.Vector3((x + w / 2) * M, floor, (y + h / 2) * M);
    // A hair off vertical, toward the south, so north stays up
    return { target, pos: target.clone().add(new THREE.Vector3(0, dist, dist * 1e-4)) };
  };

  // Entering 3D: from the plan's framing to the last 3D view (or the default one), growing the house
  useEffect(() => {
    if (!orbit) return;
    const to = lastPose.get(projectId) ?? framed(box, size.width / size.height, BIRD);
    const from = planPose();
    camera.position.copy(from.pos);
    orbit.target.copy(from.target);
    orbit.update();
    grow(hops.reduced ? 1 : 0);
    run(to, 1600, [0, 1]);
    // Start once the floor drawings are on (they rasterize asynchronously), so the first frame looks like the plan
    if (anim.current) anim.current.hold = performance.now();
    // Leaving 3D: remember the view, then sink the house back into the plan and settle on the plan's framing
    setLeave3D(
      () =>
        new Promise<void>(resolve => {
          leaving.current = true;
          lastPose.set(projectId, anim.current?.to ?? { pos: camera.position.clone(), target: orbit.target.clone() });
          run(planPose(), 1100, [1, 0], resolve);
        }),
    );
    return () => {
      setLeave3D(null);
      setPlanUntil3D(false);
      // Leaving mid-animation remembers where the camera was heading
      if (!leaving.current) lastPose.set(projectId, anim.current?.to ?? { pos: camera.position.clone(), target: orbit.target.clone() });
    };
  }, [orbit]);

  // Other floors shown (the cutaway): frame them again from the same direction (edits don't move the camera)
  useEffect(() => {
    if (shownLevels.current === levelKey) return;
    shownLevels.current = levelKey;
    grow(1);
    if (orbit) run(framed(box, size.width / size.height, direction()), 600);
  }, [levelKey]);

  // "Fit all": frame the model again from the current direction (from straight above, back to the default angle)
  const fitRequest = useEditor(s => s.fitRequest);
  useEffect(() => {
    if (!fitRequest || !orbit) return;
    const dir = direction();
    run(framed(box, size.width / size.height, dir.y > 0.99 ? BIRD : dir), 600);
  }, [fitRequest]);

  // The near plane follows the distance, so depth stays precise however far the camera zooms out
  useFrame(() => {
    if (!orbit || !(camera instanceof THREE.PerspectiveCamera)) return;
    const near = nearPlane(camera.position.distanceTo(orbit.target));
    if (Math.abs(near - camera.near) > near * 0.05) {
      camera.near = near;
      camera.updateProjectionMatrix();
    }
  });

  useFrame(({ invalidate }, dt) => {
    const a = anim.current;
    if (!a || !orbit) return;
    invalidate();
    if (a.hold) {
      const ready = floorGrowth(levels, current, 0).every(l => !l.below || (drawings.current.get(l.id)?.children.length ?? 0) > 0);
      if (!ready && performance.now() - a.hold < 1500) return;
      a.hold = undefined;
      // This frame is the plan itself: the plan kept on screen while 3D got ready can go
      setPlanUntil3D(false);
    }
    // The clock starts after two frames (the first frame in 3D can take a second, compiling shaders) so the animation plays from
    // its start; after that it follows real time, a slow frame advancing at most 200 ms, so slow devices still finish on time
    if (++a.frames > 2) a.elapsed += Math.min(dt * 1000, 200);
    const t = a.ms ? Math.min(1, a.elapsed / a.ms) : 1;
    const k = ease(t);
    // Turn around the target (angles and distance) rather than move in a straight line, so a top view stays north-up as it tilts
    const s0 = new THREE.Spherical().setFromVector3(a.from.pos.clone().sub(a.from.target));
    const s1 = new THREE.Spherical().setFromVector3(a.to.pos.clone().sub(a.to.target));
    const dTheta = Math.atan2(Math.sin(s1.theta - s0.theta), Math.cos(s1.theta - s0.theta));
    const s = new THREE.Spherical(THREE.MathUtils.lerp(s0.radius, s1.radius, k), THREE.MathUtils.lerp(s0.phi, s1.phi, k), s0.theta + dTheta * k);
    orbit.target.lerpVectors(a.from.target, a.to.target, k);
    camera.position.copy(orbit.target).add(new THREE.Vector3().setFromSpherical(s));
    if (a.grow) grow(THREE.MathUtils.lerp(a.grow[0], a.grow[1], t));
    orbit.enabled = t === 1 && !leaving.current;
    orbit.update();
    if (t === 1) {
      anim.current = null;
      a.done?.();
    }
  });
  return null;
}
