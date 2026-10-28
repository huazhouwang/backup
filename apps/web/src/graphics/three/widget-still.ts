/**
 * A still of what a widget does (issue 204), for library pages: a house (house-scene.ts) seen from the 3D view's default
 * direction with the widget's items on it. Tools draw their lines, areas and points on the floors; effects show one moment of
 * their particles, their fog, lights and sky. Drawn offscreen on the shared still renderer, as a JPEG data URL.
 */
import { fitEffects, type Project, type WidgetItem } from '@opensu/core';
import * as THREE from 'three';
import { lightDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { BIRD, FOV, framed, nearPlane } from './framing';
import { houseScene } from './house-scene';
import { withStillRenderer } from './look-preview';
import { beautyComposer, toneMap } from './beauty';
import { particlePoints, pixelsPerMetre, SKY_MOOD_LIGHT } from './particles';
import { M } from './scene';

export function renderWidgetStill(project: Project, items: WidgetItem[], level: string, opts: { width?: number; height?: number } = {}): Promise<string> {
  return withStillRenderer(r => draw(r, project, items, level, opts.width ?? 640, opts.height ?? 400));
}

async function draw(renderer: THREE.WebGLRenderer, p: Project, items: WidgetItem[], current: string, W: number, H: number): Promise<string> {
  const doc = await lightDocument();
  const hs = await houseScene(p, doc, { renderer });
  const { scene } = hs;
  const extra: { dispose(): void }[] = [];
  const elev = new Map(p.levels.map(l => [l.id, l.elevation]));
  const floor = (level?: string) => (elev.get(level ?? current) ?? 0) * M + 0.03;
  const widget = new THREE.Color(themeColor('--canvas-widget', doc));

  // Tools: lines, areas and points on their floors
  const segments: number[] = [];
  for (const i of items) {
    if (i.type === 'line') segments.push(i.from[0] * M, floor(i.level), i.from[1] * M, i.to[0] * M, floor(i.level), i.to[1] * M);
    if (i.type === 'area' || i.type === 'particles') {
      const shape = new THREE.Shape(i.outline.map(([x, y]) => new THREE.Vector2(x * M, -y * M)));
      const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: widget, transparent: true, opacity: i.type === 'area' ? 0.18 : 0.06, depthWrite: false });
      extra.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = floor(i.level);
      scene.add(mesh);
    }
    if (i.type === 'point') {
      const geo = new THREE.SphereGeometry(0.08, 12, 8),
        mat = new THREE.MeshBasicMaterial({ color: widget });
      extra.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(i.at[0] * M, floor(i.level), i.at[1] * M);
      scene.add(mesh);
    }
  }
  if (segments.length) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    const mat = new THREE.LineBasicMaterial({ color: widget });
    extra.push(geo, mat);
    scene.add(new THREE.LineSegments(geo, mat));
  }

  // Effects: one moment of them
  const fx = fitEffects(items);
  for (const item of fx.particles) {
    const points = particlePoints(item, elev.get(item.level ?? current) ?? 0, themeColor(`--canvas-effect-${item.tone}`, doc));
    points.material.uniforms.uTime.value = 1.7;
    points.material.uniforms.uScale.value = pixelsPerMetre(H, FOV);
    extra.push(points.geometry, points.material);
    scene.add(points);
  }
  for (const l of fx.lights) {
    const light = new THREE.PointLight(themeColor(`--canvas-effect-${l.tone}`, doc), l.intensity * 12, l.range * M, 2);
    light.position.set(l.at[0] * M, ((elev.get(l.level ?? current) ?? 0) + l.z) * M, l.at[1] * M);
    scene.add(light);
  }
  if (fx.fog) scene.fog = new THREE.FogExp2(themeColor(`--canvas-effect-${fx.fog.tone}`, doc), 0.002 + fx.fog.density * 0.022);
  if (fx.sky) {
    const dim = SKY_MOOD_LIGHT[fx.sky.mood];
    scene.background = new THREE.Color(themeColor(`--canvas-sky-${fx.sky.mood}`, doc));
    hs.sun.intensity *= dim.sun;
    scene.traverse(o => o instanceof THREE.HemisphereLight && (o.intensity *= dim.sky));
    scene.environmentIntensity *= dim.sky;
  }

  const pose = framed(hs.box, W / H, BIRD);
  const camera = new THREE.PerspectiveCamera(FOV, W / H, nearPlane(pose.pos.distanceTo(pose.target)), hs.radius * 40);
  camera.position.copy(pose.pos);
  camera.lookAt(pose.target);
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, W, H);
  toneMap(renderer);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const composer = beautyComposer(renderer, scene, camera, W, H);
  composer.render();
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  composer.dispose();
  renderer.toneMapping = THREE.NoToneMapping;
  extra.forEach(x => x.dispose());
  hs.dispose();
  return url;
}
