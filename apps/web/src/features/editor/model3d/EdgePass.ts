/**
 * SketchUp-style edges as a screen-space pass: a thin line where faces meet at an angle (normals differ) and a thicker profile
 * line around silhouettes (depth jumps). Working from the rendered normals and depth, coplanar faces of touching boxes (a wall's
 * segments, walls meeting at a corner) show no seam, like SketchUp's merged geometry.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNormal: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 2000 },
    edgeColor: { value: new THREE.Color(0, 0, 0) },
    /** 0 hides the edges (while the house still lies flat as the plan), 1 shows them */
    strength: { value: 1 },
    /** Profile width in pixels */
    profile: { value: 1.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tNormal, tDepth;
    uniform vec2 resolution;
    uniform float cameraNear, cameraFar, strength, profile;
    uniform vec3 edgeColor;
    varying vec2 vUv;

    float depthAt(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return perspectiveDepthToViewZ(d, cameraNear, cameraFar);
    }
    vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }
    // Background (nothing drawn): depth at the far plane
    bool empty(vec2 uv) { return texture2D(tDepth, uv).x >= 0.99999; }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 px = 1.0 / resolution;
      bool here = !empty(vUv);
      float z = here ? -depthAt(vUv) : 1e6;
      vec3 n = normalAt(vUv);

      // Creases: compare with the right and lower neighbours only, so the line is one pixel wide
      float crease = 0.0;
      vec2 fwd[2];
      fwd[0] = vec2(px.x, 0.0); fwd[1] = vec2(0.0, px.y);
      for (int i = 0; i < 2; i++) {
        vec2 q = vUv + fwd[i];
        if (here && !empty(q)) {
          float zq = -depthAt(q);
          // Only between faces at about the same depth: depth jumps are profiles
          if (abs(zq - z) < 0.06 * z + 0.05 && dot(n, normalAt(q)) < 0.8) crease = 1.0;
        }
      }

      // Profiles: a depth jump (or the model against the background) within the profile width, nearer side drawn
      float prof = 0.0;
      vec2 around[8];
      around[0] = vec2(1.0, 0.0); around[1] = vec2(-1.0, 0.0); around[2] = vec2(0.0, 1.0); around[3] = vec2(0.0, -1.0);
      around[4] = vec2(0.7, 0.7); around[5] = vec2(-0.7, 0.7); around[6] = vec2(0.7, -0.7); around[7] = vec2(-0.7, -0.7);
      for (int i = 0; i < 8; i++) {
        vec2 q = vUv + around[i] * px * profile;
        vec2 q2 = vUv + around[i] * px * (profile + 2.0);
        float zq = empty(q) ? 1e6 : -depthAt(q);
        float zq2 = empty(q2) ? 1e6 : -depthAt(q2);
        // Drawn on the nearer side only, so the line is the profile width; the far side must be wider than a pixel or two,
        // or it is a hairline crack where boxes meet end to end, not a silhouette
        float jump = 0.04 * z + 0.05;
        if (here && zq - z > jump && zq2 - z > jump) prof = 1.0;
      }

      float e = max(crease, prof) * strength;
      gl_FragColor = vec4(mix(color.rgb, edgeColor, e), color.a);
    }
  `,
};

export class EdgePass extends Pass {
  private quad: FullScreenQuad;
  private material: THREE.ShaderMaterial;
  private target: THREE.WebGLRenderTarget;
  private normals = new THREE.MeshNormalMaterial();
  private hidden: THREE.Object3D[] = [];

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    super();
    this.material = new THREE.ShaderMaterial({ ...shader, uniforms: THREE.UniformsUtils.clone(shader.uniforms) });
    this.quad = new FullScreenQuad(this.material);
    this.target = new THREE.WebGLRenderTarget(width, height, { depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType) });
    this.setSize(width, height);
  }

  get uniforms() {
    return this.material.uniforms as typeof shader.uniforms;
  }

  setSize(width: number, height: number) {
    this.target.setSize(width, height);
    this.uniforms.resolution.value.set(width, height);
  }

  /** Objects with no edges: overlays (the floor drawings), the shadow catcher, lines */
  private hide() {
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      const shadowOnly = (m.material as THREE.Material | undefined)?.type === 'ShadowMaterial';
      if (
        o.visible &&
        (o.userData.noEdges || shadowOnly || (o as { isLineSegments2?: boolean }).isLineSegments2 || (o as THREE.Line).isLine || (o as THREE.Points).isPoints)
      ) {
        o.visible = false;
        this.hidden.push(o);
      }
    });
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const cam = this.camera as THREE.PerspectiveCamera;
    // Normals and depth of the model
    this.hide();
    const background = this.scene.background,
      fog = this.scene.fog,
      override = this.scene.overrideMaterial;
    this.scene.background = null;
    this.scene.fog = null;
    this.scene.overrideMaterial = this.normals;
    const clear = renderer.getClearColor(new THREE.Color()),
      alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x8080ff, 1);
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, cam);
    renderer.setClearColor(clear, alpha);
    this.scene.background = background;
    this.scene.fog = fog;
    this.scene.overrideMaterial = override;
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];

    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tNormal.value = this.target.texture;
    u.tDepth.value = this.target.depthTexture;
    u.cameraNear.value = cam.near;
    u.cameraFar.value = cam.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.normals.dispose();
    this.quad.dispose();
  }
}
