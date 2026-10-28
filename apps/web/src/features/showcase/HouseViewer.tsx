/**
 * The published house in 3D on its share page (issue 196): the same scene as the design-list stills and the style renders
 * (house-scene.ts), framed like the editor's default view, to orbit, pan and zoom. Drawn only when the view changes.
 */
import type { Project } from '@opensu/core';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { lightDocument } from '@/canvas/CanvasFrame';
import { BIRD, FOV, framed, nearPlane } from '@/graphics/three/framing';
import { houseScene } from '@/graphics/three/house-scene';
import { m } from '@/lib/i18n';
import { cn } from 'cn';

export function HouseViewer({ project, className }: { project: Project; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current!;
    let live = true;
    let cleanup = () => {};
    void (async () => {
      const hs = await houseScene(project, await lightDocument());
      if (!live) return hs.dispose();
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.shadowMap.enabled = true;
      renderer.toneMapping = THREE.NoToneMapping;
      el.appendChild(renderer.domElement);
      renderer.domElement.className = 'block h-full w-full touch-none';
      const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, hs.radius * 40);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2 - 0.02;
      let frame = 0;
      // One frame at a time: the controls' change event (fired inside update) may already have asked for the next one
      const draw = () => {
        frame = 0;
        const moving = controls.update();
        camera.near = nearPlane(camera.position.distanceTo(controls.target));
        camera.updateProjectionMatrix();
        renderer.render(hs.scene, camera);
        if (moving && !frame) frame = requestAnimationFrame(draw);
      };
      const redraw = () => void (frame ||= requestAnimationFrame(draw));
      const fit = () => {
        const { width, height } = el.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        const pose = framed(hs.box, camera.aspect, BIRD);
        camera.position.copy(pose.pos);
        controls.target.copy(pose.target);
        redraw();
      };
      const resize = new ResizeObserver(fit);
      resize.observe(el);
      controls.addEventListener('change', redraw);
      fit();
      cleanup = () => {
        resize.disconnect();
        cancelAnimationFrame(frame);
        controls.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        hs.dispose();
      };
    })();
    return () => {
      live = false;
      cleanup();
    };
  }, [project]);
  return <div ref={box} role="img" aria-label={m.showcase_viewer_aria()} className={cn('overflow-hidden rounded-md border bg-muted', className)} />;
}
