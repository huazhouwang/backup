/** The sandbox's worker as a classic script (see sandboxWorker in vite.config.ts) */
declare module 'virtual:sandbox-worker' {
  const source: string;
  export default source;
}

/** The wheels as one ES module (see canvasWheels in vite.config.ts), inlined into the sandboxed canvas page as `plinth` */
declare module 'virtual:canvas-wheels' {
  const source: string;
  export default source;
}

/** N8AO ships no types; the part the 3D view uses (see graphics/three/beauty.ts) */
declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: Record<string, unknown>;
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}
