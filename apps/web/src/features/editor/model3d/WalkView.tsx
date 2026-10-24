/**
 * Walking through the house at eye height, as SketchUp's walk and look-around tools: the camera stands 1.6 m above the floor in a
 * room of the current level (the selected one if any), with a wider lens. Dragging looks around; a tap on a floor walks there; the
 * wheel steps forward or back; WASD or the arrow keys walk. The whole house is shown, so the floors above are the ceilings.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { area, pointInPolygon, type Point, type Project } from '@plinth/core';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { FOV } from '@/graphics/three/framing';
import { M } from '@/graphics/three/scene';
import { useEditor, useEditorStore } from '../store';
import { resumeOrbit } from './CameraRig';

/** Eye height above the floor (m) */
const EYE = 1.6;
const WALK_FOV = 65;
/** Walking speed with the keys (m/s) and a wheel step (m) */
const SPEED = 1.6;
const STEP = 0.5;
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

export function WalkView() {
  const project = useEditor(s => s.project);
  const projectId = useEditor(s => s.projectId);
  const store = useEditorStore();
  const { camera, gl, scene, raycaster, invalidate } = useThree();
  const doc = useCanvasDocument();
  const look = useRef({ yaw: 0, pitch: 0 });
  const walk = useRef<{ from: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const keys = useRef(new Set<string>());

  const aim = () => {
    const { yaw, pitch } = look.current;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(camera.position.clone().add(dir));
    invalidate();
  };

  // Stand in the room; a wider lens and a near plane for close walls. Coming from an elevation, the perspective camera is back
  // as the default one a render later: set up then
  useEffect(() => {
    if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    const { view } = store.getState();
    const level = project.levels.find(l => l.id === view.level) ?? project.levels[0];
    const at = walkStart(project, level.id, view.selection[0]) ?? [0, 0];
    camera.position.set(at[0] * M, level.elevation * M + EYE, at[1] * M);
    look.current = { yaw: 0, pitch: -0.05 };
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = WALK_FOV;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    store.getState().setPlanUntil3D(false);
    aim();
    return () => {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
      if (store.getState().view.mode === '3d') resumeOrbit.add(projectId);
    };
  }, [camera]);

  // Drag to look around, tap a floor to walk there, wheel to step
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; id: number; moved: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) < 5) return;
      down.moved = true;
      down.x = e.clientX;
      down.y = e.clientY;
      // Dragging turns the view the other way, as if grabbing the scene
      look.current.yaw -= dx * 0.004;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + dy * 0.004, -1.3, 1.3);
      aim();
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.moved || e.pointerId !== d.id) return;
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(h => (h.object as THREE.Mesh).isMesh && h.face);
      // Only floors: a surface facing up
      const n = hit?.face?.normal.clone().transformDirection(hit.object.matrixWorld);
      if (!hit || !n || n.y < 0.7) return;
      walk.current = { from: camera.position.clone(), to: new THREE.Vector3(hit.point.x, hit.point.y + EYE, hit.point.z), t: 0 };
      invalidate();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = new THREE.Vector3(Math.sin(look.current.yaw), 0, -Math.cos(look.current.yaw));
      camera.position.add(f.multiplyScalar(e.deltaY < 0 ? STEP : -STEP));
      invalidate();
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, [gl, camera, scene, raycaster]);

  // Keys, in the canvas's window and the page's (the canvas forwards its key presses, not its releases)
  useEffect(() => {
    const wins = [...new Set([doc.defaultView!, window])];
    const press = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in MOVE_KEYS) || (e.target as Partial<HTMLElement> | null)?.closest?.('input, textarea, [contenteditable]')) return;
      keys.current.add(k);
      invalidate();
    };
    const release = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const clear = () => keys.current.clear();
    for (const w of wins) {
      w.addEventListener('keydown', press);
      w.addEventListener('keyup', release);
      w.addEventListener('blur', clear);
    }
    return () => {
      for (const w of wins) {
        w.removeEventListener('keydown', press);
        w.removeEventListener('keyup', release);
        w.removeEventListener('blur', clear);
      }
    };
  }, [doc]);

  useFrame((_, dt) => {
    const w = walk.current;
    if (w) {
      w.t = Math.min(1, w.t + dt / 0.7);
      const k = w.t < 0.5 ? 2 * w.t * w.t : 1 - (-2 * w.t + 2) ** 2 / 2;
      camera.position.lerpVectors(w.from, w.to, k);
      if (w.t === 1) walk.current = null;
      invalidate();
    }
    if (keys.current.size) {
      let fwd = 0,
        side = 0;
      for (const k of keys.current) {
        fwd += MOVE_KEYS[k][0];
        side += MOVE_KEYS[k][1];
      }
      const yaw = look.current.yaw;
      const f = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)),
        r = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      camera.position.add(f.multiplyScalar(fwd * SPEED * dt)).add(r.multiplyScalar(side * SPEED * dt));
      invalidate();
    }
  });
  return null;
}
