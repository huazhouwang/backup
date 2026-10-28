/**
 * How the house is lit and finished on screen (issue 208), shared by the editor's 3D view and the stills: the sky as image-based
 * light, the sun, Khronos PBR Neutral tone mapping, ambient occlusion (N8AO, which ignores glass rather than darkening behind
 * it) and anti-aliasing. One set of values (LOOK) for all of them, so a still looks like the view it shows.
 */
import { N8AOPass } from 'n8ao';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ENVIRONMENT_INTENSITY, SKYLIGHT_INTENSITY, SUN_INTENSITY, TONE_EXPOSURE } from './scene/lighting';

export interface Look {
  /** The sun's intensity */
  sun: number;
  /** The hemisphere sky light, on top of the environment */
  sky: number;
  /** The sky environment's strength */
  environment: number;
  /** Tone mapping exposure */
  exposure: number;
  /** Ambient occlusion: strength, and reach in metres */
  ao: number;
  aoRadius: number;
}

export const LOOK: Look = { sun: SUN_INTENSITY, sky: SKYLIGHT_INTENSITY, environment: ENVIRONMENT_INTENSITY, exposure: TONE_EXPOSURE, ao: 3.5, aoRadius: 1.5 };

/** The renderer set up for the look: Neutral tone mapping at the look's exposure */
export function toneMap(renderer: THREE.WebGLRenderer, look: Look = LOOK) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure;
}

/** Ambient occlusion in corners, where walls meet floors and under furniture, about an arm's reach; glass is left out */
export function aoPass(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, look: Look = LOOK) {
  const ao = new N8AOPass(scene, camera, width, height);
  Object.assign(ao.configuration, {
    aoRadius: look.aoRadius,
    distanceFalloff: look.aoRadius / 4,
    intensity: look.ao,
    aoSamples: 16,
    denoiseSamples: 8,
    denoiseRadius: 12,
    transparencyAware: true,
    gammaCorrection: false,
    screenSpaceRadius: false,
  });
  return ao;
}

/**
 * The chain a frame goes through: the scene with ambient occlusion (or plainly, multisampled, on the light setup), whatever
 * passes the caller adds (`extra`), the output conversion with tone mapping, then SMAA for the edges ambient occlusion can't
 * multisample.
 */
export function beautyComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  opts: { ao?: boolean; look?: Look; extra?: { addPass(c: EffectComposer): void } } = {},
) {
  const ao = opts.ao ?? true;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: ao ? 0 : 4 }));
  composer.addPass(ao ? aoPass(scene, camera, width, height, opts.look) : new RenderPass(scene, camera));
  opts.extra?.addPass(composer);
  composer.addPass(new OutputPass());
  if (ao) composer.addPass(new SMAAPass());
  // The passes go with the composer
  const dispose = composer.dispose.bind(composer);
  composer.dispose = () => {
    for (const pass of composer.passes) pass.dispose();
    dispose();
  };
  return composer;
}
