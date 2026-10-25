/**
 * Walking through the house at eye height, as wushi-amr's walk. On a computer a click locks the pointer and the mouse looks
 * around; WASD or the arrow keys walk, Q/E turn, Shift runs; the first Esc frees the pointer (the browser's), the next leaves
 * walking. On a touch screen a finger on the left of the view brings up a joystick where it lands and walks, a finger on the
 * right looks around, both at once. Walls stop the body and it slides along them; steps up to 0.4 m are climbed, so stairs lead
 * upstairs, and the current level follows where you stand (see walk-world.ts). Each level starts in its largest room, facing
 * the nearest door or window; the level switcher goes to that start. The whole house is shown, so the floors above are the
 * ceilings.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { area, findObject, openingFrames, pointInPolygon, type Point, type Project } from '@plinth/core';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { FOV } from '@/graphics/three/framing';
import { M } from '@/graphics/three/scene';
import { useEditor, useEditorStore } from '../store';
import { northOnPlan } from '@/lib/solar';
import { publishHeading } from '../compass/heading';
import { resumeOrbit } from './CameraRig';
import { closeAllDoors, passableDoors, setDoorOpen } from './doors';
import { buildWorld, collide, EYE, groundAt, type Role, type World } from './walk-world';

const WALK_FOV = 70;
/** How near a sliding door opens (m) and how fast (fully open in 1 / DOOR_SPEED s) */
const DOOR_REACH = 2;
const DOOR_SPEED = 1.6;
/** Walking and running speeds (m/s), turning speed with Q/E (rad/s) */
const WALK = 1.4;
const RUN = 3;
const TURN = 1.6;
/** Joystick reach (px); the share of the view's width on the left where a finger walks */
export const JOY_REACH = 45;
const JOY_SIDE = 0.45;
const MOVE_KEYS: Record<string, [number, number]> = {
  w: [1, 0],
  arrowup: [1, 0],
  s: [-1, 0],
  arrowdown: [-1, 0],
  a: [0, -1],
  arrowleft: [0, -1],
  d: [0, 1],
  arrowright: [0, 1],
};
const KEYS = new Set([...Object.keys(MOVE_KEYS), 'q', 'e', 'shift']);

/** The floating joystick while a finger walks (where it landed and its push, -1…1), for the overlay drawn over the view */
type Pad = { x: number; y: number; dx: number; dy: number } | null;
const pad = { joy: null as Pad, listeners: new Set<() => void>() };
const setPad = (joy: Pad) => {
  pad.joy = joy;
  for (const l of pad.listeners) l();
};
export const useWalkPad = () =>
  useSyncExternalStore(
    l => {
      pad.listeners.add(l);
      return () => pad.listeners.delete(l);
    },
    () => pad.joy,
  );

/** Where to stand: in the selected room, else the largest indoor room of the level; its middle if inside it, else a corner's neighbourhood */
export function walkStart(p: Project, level: string, selected?: string): Point | null {
  const rooms = p.spaces.filter(s => s.level === level && s.kind !== 'void');
  const room = rooms.find(s => s.id === selected) ?? [...rooms].filter(s => s.kind === 'indoor').sort((a, b) => area(b.shape) - area(a.shape))[0] ?? rooms[0];
  if (!room) return null;
  const ring = room.shape[0].outer;
  const xs = ring.map(q => q[0]),
    ys = ring.map(q => q[1]);
  const mid: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  if (room.shape.some(poly => pointInPolygon(mid, poly))) return mid;
  // An L-shaped room: step in from its first corner towards the middle
  return [ring[0][0] + (mid[0] - ring[0][0]) * 0.25, ring[0][1] + (mid[1] - ring[0][1]) * 0.25];
}

/** Facing the door or window nearest to where you stand: the yaw (radians, 0 looks north on the drawing, i.e. along -y) */
export function walkFacing(p: Project, level: string, at: Point): number {
  const near = openingFrames(p)
    .filter(f => f.level === level)
    .sort((a, b) => Math.hypot(a.center[0] - at[0], a.center[1] - at[1]) - Math.hypot(b.center[0] - at[0], b.center[1] - at[1]))[0];
  if (!near) return 0;
  return Math.atan2(-(near.center[0] - at[0]), -(near.center[1] - at[1]));
}

/** How the walker treats an object: walls and windows stop it, doors and furniture don't; anything else carries the feet */
export function walkRole(p: Project, id: string | undefined): Role {
  const o = id ? findObject(p, id) : undefined;
  if (!o) return { block: false, ground: true };
  if (o.kind === 'furniture') return { block: false, ground: false };
  if (o.kind === 'wall') return { block: true, ground: true };
  // Doors, gates and bare openings are walked through; a sliding glass door stops you until it opens (see the doors below); a
  // window stops you, even down to the floor
  if (o.kind === 'opening') return o.obj.kind === 'window' || o.obj.kind === 'sliding-door' ? { block: true, ground: false } : { block: false, ground: false };
  return { block: false, ground: true };
}

export function WalkView() {
  const project = useEditor(s => s.project);
  const projectId = useEditor(s => s.projectId);
  const level = useEditor(s => s.view.level);
  const store = useEditorStore();
  const { camera, gl, scene, invalidate } = useThree();
  const doc = useCanvasDocument();
  const me = useRef({ x: 0, z: 0, foot: 0, vy: 0, eye: null as number | null, yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const joy = useRef<{ id: number; ox: number; oy: number; dx: number; dy: number } | null>(null);
  const world = useRef<{ project: Project; world: World; at: number } | null>(null);
  // The sliding glass doors (their middle, m) and how far each has opened
  const slidingDoors = useMemo(
    () =>
      openingFrames(project)
        .filter(f => f.opening.kind === 'sliding-door')
        .map(f => ({ id: f.id, x: f.center[0] * M, z: f.center[1] * M, floor: (project.levels.find(l => l.id === f.level)?.elevation ?? 0) * M })),
    [project],
  );
  const doorMotion = useRef(new Map<string, number>());
  useEffect(() => closeAllDoors, []);
  // The level the walker stands on, so a change from the switcher (not from walking) goes to that level's start
  const standing = useRef<string | null>(null);

  const aim = () => {
    camera.rotation.set(me.current.pitch, me.current.yaw, 0, 'YXZ');
    invalidate();
  };
  /** Stand at a level's start */
  const goTo = (levelId: string) => {
    const l = project.levels.find(x => x.id === levelId) ?? project.levels[0];
    const at = walkStart(project, l.id, store.getState().view.selection[0]) ?? [0, 0];
    Object.assign(me.current, { x: at[0] * M, z: at[1] * M, foot: l.elevation * M + 0.3, vy: 0, eye: null, yaw: walkFacing(project, l.id, at), pitch: 0 });
    standing.current = l.id;
    invalidate();
  };

  // A wider lens and a near plane for close walls; back to the orbit view where it was on leaving
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = WALK_FOV;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    store.getState().setPlanUntil3D(false);
    goTo(store.getState().view.level);
    return () => {
      cam.fov = FOV;
      cam.rotation.order = 'XYZ';
      cam.updateProjectionMatrix();
      if (store.getState().view.mode === '3d') resumeOrbit.add(projectId);
    };
  }, []);

  // In development (and so in the end-to-end tests), where the walker stands can be read and set from the canvas's window
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const win = doc.defaultView as unknown as { walkProbe?: unknown };
    win.walkProbe = {
      get: () => ({ ...me.current, level: standing.current }),
      set: (at: Partial<typeof me.current>) => {
        Object.assign(me.current, at);
        invalidate();
      },
    };
    return () => void delete win.walkProbe;
  }, [doc]);

  // The compass: tapped, look north
  const northRequest = useEditor(s => s.northRequest);
  useEffect(() => {
    if (!northRequest) return;
    const [nx, ny] = northOnPlan(project.site.northAngle);
    Object.assign(me.current, { yaw: Math.atan2(-nx, -ny), pitch: 0 });
    invalidate();
  }, [northRequest]);

  // The level switcher: go to that level's start
  useEffect(() => {
    if (standing.current && level !== standing.current) goTo(level);
  }, [level]);

  // Pointer input: a mouse click locks the pointer, a finger on the left walks with a joystick, anywhere else a drag looks around
  useEffect(() => {
    const el = gl.domElement;
    const before = el.style.touchAction;
    // Touch gestures are ours, not the page's (scrolling, zooming): the orbit controls that claimed them are gone while walking
    el.style.touchAction = 'none';
    const looks = new Map<number, { x: number; y: number }>();
    const turn = (dx: number, dy: number, k: number) => {
      me.current.yaw -= dx * k;
      me.current.pitch = THREE.MathUtils.clamp(me.current.pitch - dy * k, -1.2, 1.2);
      aim();
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      if (e.pointerType === 'mouse') {
        if (doc.pointerLockElement !== el) {
          // Pointer lock isn't everywhere (and a test browser may refuse it): dragging looks around meanwhile
          looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
          void Promise.resolve(el.requestPointerLock?.()).catch(() => {});
        }
        return;
      }
      if (!joy.current && e.clientX - r.left < r.width * JOY_SIDE) {
        joy.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
        setPad({ x: e.clientX - r.left, y: e.clientY - r.top, dx: 0, dy: 0 });
        invalidate();
      } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onMove = (e: PointerEvent) => {
      const j = joy.current;
      if (j && e.pointerId === j.id) {
        let dx = e.clientX - j.ox,
          dy = e.clientY - j.oy;
        const len = Math.hypot(dx, dy);
        if (len > JOY_REACH) [dx, dy] = [(dx / len) * JOY_REACH, (dy / len) * JOY_REACH];
        j.dx = dx / JOY_REACH;
        j.dy = dy / JOY_REACH;
        const r = el.getBoundingClientRect();
        setPad({ x: j.ox - r.left, y: j.oy - r.top, dx, dy });
        invalidate();
        return;
      }
      const l = looks.get(e.pointerId);
      if (!l) return;
      turn(e.clientX - l.x, e.clientY - l.y, 0.005);
      l.x = e.clientX;
      l.y = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (joy.current?.id === e.pointerId) {
        joy.current = null;
        setPad(null);
      }
      looks.delete(e.pointerId);
    };
    // With the pointer locked the mouse looks around without a button
    const onLocked = (e: MouseEvent) => {
      if (doc.pointerLockElement === el) turn(e.movementX, e.movementY, 0.0025);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    doc.addEventListener('mousemove', onLocked);
    return () => {
      el.style.touchAction = before;
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      doc.removeEventListener('mousemove', onLocked);
      if (doc.pointerLockElement === el) doc.exitPointerLock();
      joy.current = null;
      setPad(null);
    };
  }, [gl, doc]);

  // Keys, in the canvas's window and the page's (the canvas forwards its key presses, not its releases). An Esc that frees the
  // locked pointer stays here, so only the next one leaves walking
  useEffect(() => {
    const el = gl.domElement;
    const wins = [...new Set([doc.defaultView!, window])];
    let freed = 0;
    const onLockChange = () => {
      if (doc.pointerLockElement !== el) freed = performance.now();
    };
    const holdEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (doc.pointerLockElement === el || performance.now() - freed < 250)) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    const press = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!KEYS.has(k) || (e.target as Partial<HTMLElement> | null)?.closest?.('input, textarea, [contenteditable]')) return;
      keys.current.add(k);
      invalidate();
    };
    const release = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    doc.addEventListener('pointerlockchange', onLockChange);
    doc.defaultView!.addEventListener('keydown', holdEsc, true);
    for (const w of wins) {
      w.addEventListener('keydown', press);
      w.addEventListener('keyup', release);
      w.addEventListener('blur', clear);
    }
    return () => {
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.defaultView!.removeEventListener('keydown', holdEsc, true);
      for (const w of wins) {
        w.removeEventListener('keydown', press);
        w.removeEventListener('keyup', release);
        w.removeEventListener('blur', clear);
      }
    };
  }, [doc, gl]);

  useFrame((_, delta) => {
    // What there is to walk into: built from the scene, again after an edit, and once more when the house has settled
    const now = performance.now();
    const w0 = world.current;
    if (!w0 || w0.project !== project || (w0.at && now - w0.at > 1000)) {
      world.current = { project, world: buildWorld(scene, id => walkRole(project, id)), at: w0?.project === project ? 0 : now };
    }
    const w = world.current!.world;
    const m = me.current;
    const k = keys.current;
    let fwd = 0,
      side = 0;
    for (const key of k) {
      const mv = MOVE_KEYS[key];
      if (mv) {
        fwd += mv[0];
        side += mv[1];
      }
    }
    if (joy.current) {
      fwd -= joy.current.dy;
      side += joy.current.dx;
    }
    // Sliding glass doors open as you come near, and close behind you
    const through = passableDoors();
    let doorsMoving = false;
    for (const d of slidingDoors) {
      const near = Math.abs(m.foot - d.floor) < 1.2 && Math.hypot(m.x - d.x, m.z - d.z) < DOOR_REACH;
      const v = doorMotion.current.get(d.id) ?? 0;
      const next = THREE.MathUtils.clamp(v + (near ? 1 : -1) * Math.min(0.15, delta) * DOOR_SPEED, 0, 1);
      if (next === v) continue;
      doorsMoving = true;
      doorMotion.current.set(d.id, next);
      const was = through.has(d.id);
      setDoorOpen(d.id, Math.round(next * 10) / 10);
      // Its leaves are built anew as it moves: look at the scene again once they are in place
      if (was !== passableDoors().has(d.id) && world.current) world.current.at = performance.now() - 700;
    }
    // A slow frame still walks at full speed, in short steps so the body never skips through a wall
    const total = Math.min(0.15, delta);
    const n = Math.ceil(total / 0.034);
    let settling = false;
    for (let i = 0; i < n; i++) {
      const dt = total / n;
      if (k.has('q')) m.yaw += dt * TURN;
      if (k.has('e')) m.yaw -= dt * TURN;
      const speed = (k.has('shift') ? RUN : WALK) * dt;
      const sy = Math.sin(m.yaw),
        cy = Math.cos(m.yaw);
      let nx = m.x + (-sy * fwd + cy * side) * speed,
        nz = m.z + (-cy * fwd - sy * side) * speed;
      [nx, nz] = collide(w, nx, nz, m.foot, through);
      const g = groundAt(w, nx, nz, m.foot);
      if (g !== null && g >= m.foot - 0.02) {
        // Up a step smoothly
        m.foot += (g - m.foot) * Math.min(1, dt * 12);
        m.vy = 0;
        settling ||= Math.abs(g - m.foot) > 0.002;
      } else {
        m.vy -= 9.8 * dt;
        m.foot = Math.max(g ?? -Infinity, m.foot + m.vy * dt);
        if (g !== null && m.foot <= g) m.vy = 0;
        settling = true;
      }
      m.x = nx;
      m.z = nz;
      const eye = m.foot + EYE;
      m.eye = m.eye === null ? eye : m.eye + (eye - m.eye) * Math.min(1, dt * 10);
      settling ||= Math.abs(eye - m.eye) > 0.002;
    }
    // Fallen off the edge of the world: back to the level's start
    if (m.foot < project.site.groundLevel * M - 10) goTo(standing.current ?? level);
    camera.position.set(m.x, m.eye!, m.z);
    camera.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    publishHeading(camera, project.site.northAngle);
    // The level follows the feet
    const on = [...project.levels]
      .sort((a, b) => a.elevation - b.elevation)
      .filter(l => l.elevation * M <= m.foot + 0.5)
      .pop();
    if (on && on.id !== standing.current) {
      standing.current = on.id;
      store.getState().setView({ level: on.id });
    }
    if (k.size || joy.current || settling || m.vy || doorsMoving) invalidate();
  });
  return null;
}
