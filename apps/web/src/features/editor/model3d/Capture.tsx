import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { useEditor } from '../store';

/**
 * The view renders on demand (nothing changes, nothing is drawn). Selection and highlights can change without any prop on the
 * scene changing (the agent pointing at an object starts its hop and tint), so wake the scene when they do.
 */
export function Wake({ on }: { on: unknown[] }) {
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => invalidate(), on);
  return null;
}

/** Safari reports a trackpad pinch as gesture events (other browsers send a wheel event with ctrlKey, which OrbitControls handles) */

/** Screenshots of the 3D view (for the agent and image export), drawn at rest */
export function Capture({ draw }: { draw: React.RefObject<(() => void) | null> }) {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const camera = useThree(s => s.camera);
  const setCapture = useEditor(s => s.setCapture);
  useEffect(() => {
    setCapture(async () => {
      // Capture the drawing only: put hopping and tinted objects back to rest first
      scene.traverse(o => {
        if (typeof o.userData.restY === 'number') o.position.y = o.userData.restY;
        if (o.userData.baseColor) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.copy(o.userData.baseColor);
      });
      if (draw.current) draw.current();
      else gl.render(scene, camera);
      const c = gl.domElement;
      return { dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height };
    });
    return () => setCapture(null);
  }, [gl, scene, camera]);
  return null;
}
