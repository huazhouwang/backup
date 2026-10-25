/**
 * The sun in the sky, where it stands at the chosen day and time (see lib/solar.ts): a bright disc with a glow, kept far off in its
 * direction from wherever the camera is, so it sits on the sky as the real sun does and the house hides it. Gone below the
 * horizon. A tap on it opens the day and time (see SunControls).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { useEditor } from '../store';

/** How far off the disc is drawn (m, within the camera's far plane) and its glow's angular radius */
const DISTANCE = 1500;
const GLOW = THREE.MathUtils.degToRad(5);

/** A round glow: the disc solid in the middle, fading out to the edge */
function glowTexture(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, color);
  r.addColorStop(0.22, color);
  r.addColorStop(0.3, `color-mix(in oklab, ${color} 55%, transparent)`);
  r.addColorStop(1, `color-mix(in oklab, ${color} 0%, transparent)`);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function Sun3D({ toward, up }: { toward: THREE.Vector3; up: boolean }) {
  const doc = useCanvasDocument();
  const camera = useThree(s => s.camera);
  const setSunOpen = useEditor(s => s.setSunOpen);
  const sprite = useRef<THREE.Sprite>(null);
  const color = themeColor('--canvas-sun-disc', doc);
  const map = useMemo(() => glowTexture(color), [color]);
  useEffect(() => () => map.dispose(), [map]);
  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    s.position.copy(camera.position).addScaledVector(toward, DISTANCE);
    s.scale.setScalar(2 * DISTANCE * Math.tan(GLOW));
  });
  if (!up) return null;
  return (
    <sprite
      ref={sprite}
      renderOrder={-1}
      userData={{ noEdges: true, measure: true }}
      onClick={e => {
        e.stopPropagation();
        setSunOpen(true);
      }}
    >
      <spriteMaterial map={map} transparent depthWrite={false} fog={false} toneMapped={false} />
    </sprite>
  );
}
