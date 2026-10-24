/**
 * Draws the 3D view through a post-processing chain: the scene, SketchUp-style edges when the model style has them (see
 * EdgePass), then the output conversion.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { EdgePass } from './EdgePass';

export type Quality = 'high' | 'low';

/** Older mobile GPUs: Mali-400/450 and the Mali-T series, Adreno 500 and below, PowerVR SGX */
const WEAK_GPU = /Mali-(4\d\d|T\d+)|Adreno \(TM\) [1-5]\d\d\b|PowerVR SGX/i;

/** Touch-first devices; only these are ever downgraded */
export const isTouchDevice = (win: Window) => win.matchMedia('(pointer: coarse)').matches;

/**
 * Low-end phones get the light setup (lower resolution, smaller shadow and floor-drawing textures): a touch device with 2 GB of
 * memory or less, an Android device with 4 cores or fewer, or an older mobile GPU. Everything else, recent iPhones included, gets
 * the full look; a phone missed here still drops to the light setup if it can't keep up (see Model3D).
 */
export function detectQuality(win: Window, gl: WebGLRenderingContext | WebGL2RenderingContext): Quality {
  if (!isTouchDevice(win)) return 'high';
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  const android = /Android/i.test(nav.userAgent);
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  const weak = (nav.deviceMemory !== undefined && nav.deviceMemory < 4) || (android && nav.hardwareConcurrency <= 4) || WEAK_GPU.test(gpu);
  return weak ? 'low' : 'high';
}

/**
 * Takes over rendering from react-three-fiber; `draw` renders one frame the same way, for screenshots. Edges show once the house
 * has grown out of the plan (`growth`: 0 flat, 1 built), so the flat start still looks exactly like the plan.
 */
export function Renderer({
  draw,
  edges: withEdges,
  edgeColor,
  growth,
}: {
  draw: React.RefObject<(() => void) | null>;
  edges: boolean;
  edgeColor: string;
  growth: React.RefObject<{ g: number }>;
}) {
  const { gl, scene, camera, size } = useThree();
  const { composer, edges } = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const e = withEdges ? new EdgePass(scene, camera, size.width, size.height) : null;
    if (e) c.addPass(e);
    c.addPass(new OutputPass());
    return { composer: c, edges: e };
  }, [gl, scene, camera, withEdges]);
  useEffect(() => () => composer.dispose(), [composer]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, size, gl]);
  useEffect(() => void edges?.uniforms.edgeColor.value.set(edgeColor), [edges, edgeColor]);

  const render = () => {
    if (edges) {
      edges.uniforms.strength.value = THREE.MathUtils.smoothstep(growth.current.g, 0.2, 0.7);
      // About two CSS pixels wide, like SketchUp's default profiles
      edges.uniforms.profile.value = 1.5 * gl.getPixelRatio();
    }
    composer.render();
  };
  draw.current = render;
  // A positive priority takes over rendering from react-three-fiber
  useFrame(render, 1);
  return null;
}
