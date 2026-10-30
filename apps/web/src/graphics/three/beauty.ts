/**
 * How the house is lit and finished on screen (issue 208), shared by the editor's 3D view and the stills: the sky as image-based
 * light, the sun, Khronos PBR Neutral tone mapping, ambient occlusion (N8AO, which ignores glass rather than darkening behind
 * it), multisampling, SketchUp-style profiles where asked, and a light grade at the end (issue 213: the designer's presentation
 * look, colour held back and a touch warm). One set of values (LOOK) for all of them, so a still looks like the view it shows.
 */
import { N8AOPass } from 'n8ao';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { EdgePass } from './edges';
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
  /** The grade on the final image: saturation (1 unchanged) and a warmth multiplied into red, green and blue */
  saturation: number;
  warmth: [number, number, number];
}

/** WebGL drawn on the CPU (no GPU, a virtual machine, a blocklisted driver): the sky environment and ambient occlusion would take seconds */
const SOFTWARE_GL = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render/i;

export function isSoftwareGL(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return SOFTWARE_GL.test(info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '');
}

export const LOOK: Look = {
  sun: SUN_INTENSITY,
  sky: SKYLIGHT_INTENSITY,
  environment: ENVIRONMENT_INTENSITY,
  exposure: TONE_EXPOSURE,
  ao: 3.5,
  aoRadius: 1.5,
  saturation: 0.85,
  warmth: [1.01, 1, 0.985],
};

/** The grade: in display colours, after tone mapping, as a photo is graded */
const gradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 1 }, warmth: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float saturation;
    uniform vec3 warmth;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(clamp(mix(vec3(l), c.rgb, saturation) * warmth, 0.0, 1.0), c.a);
    }`,
};

export function gradePass(look: Look = LOOK) {
  const pass = new ShaderPass(gradeShader);
  pass.uniforms.saturation.value = look.saturation;
  pass.uniforms.warmth.value.set(...look.warmth);
  return pass;
}

/** The renderer set up for the look: Neutral tone mapping at the look's exposure */
export function toneMap(renderer: THREE.WebGLRenderer, look: Look = LOOK) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure;
}

/** Ambient occlusion in corners, where walls meet floors and under furniture, about an arm's reach; glass is left out */
export function aoPass(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, look: Look = LOOK, halfRes = false) {
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
    // Its buffers at half size, a quarter of the memory (phones)
    halfRes,
  });
  // The scene drawn multisampled (three resolves colour and depth), so edges are smooth without a screen-space filter that would
  // also blur the selection's one-pixel stipple
  const beauty = ao.beautyRenderTarget;
  ao.beautyRenderTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
  ao.beautyRenderTarget.texture.minFilter = THREE.LinearFilter;
  ao.beautyRenderTarget.texture.magFilter = THREE.NearestFilter;
  ao.beautyRenderTarget.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  beauty.dispose();
  return ao;
}

/**
 * The chain a frame goes through: the scene, multisampled, with ambient occlusion (or plainly on the light setup), profiles
 * (`edges`: their colour) or whatever passes the caller adds (`extra`), the output conversion with tone mapping, then the grade.
 */
export function beautyComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  opts: { ao?: boolean; halfAo?: boolean; look?: Look; edges?: THREE.ColorRepresentation; extra?: { addPass(c: EffectComposer): void } } = {},
) {
  const ao = opts.ao ?? !isSoftwareGL(renderer.getContext());
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: ao ? 0 : 4 }));
  composer.addPass(ao ? aoPass(scene, camera, width, height, opts.look, opts.halfAo) : new RenderPass(scene, camera));
  if (opts.edges !== undefined) {
    const edges = new EdgePass(scene, camera, width, height);
    edges.uniforms.edgeColor.value.set(opts.edges);
    // A still is smaller than the view: lines a little lighter, so they don't crowd it
    edges.uniforms.strength.value = 0.8;
    composer.addPass(edges);
  }
  opts.extra?.addPass(composer);
  composer.addPass(new OutputPass());
  composer.addPass(gradePass(opts.look));
  // The passes go with the composer
  const dispose = composer.dispose.bind(composer);
  composer.dispose = () => {
    for (const pass of composer.passes) pass.dispose();
    dispose();
  };
  return composer;
}
