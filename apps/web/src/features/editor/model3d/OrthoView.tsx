/**
 * Elevations and sections, as Revit's views: an orthographic camera square to a side of the house (named by true north) or across a
 * section line, panned and zoomed but not turned. A section clips away everything on the viewer's side of the line and fills the
 * walls and floors it cuts solid (see section.ts). Both show the levels as datum lines with their elevations.
 */
import { Html, Line, OrbitControls, OrthographicCamera } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Point } from '@plinth/core';
import { useCanvasDocument } from '@/canvas/CanvasFrame';
import { themeColor } from '@/lib/theme';
import { elevationLabel, sectionAxes, sectionCuts } from '@/graphics/three/section';
import { M } from '@/graphics/three/scene';
import { useEditor, useEditorStore } from '../store';
import type { View3D } from '../store/types';
import { resumeOrbit } from './CameraRig';

/** The viewer's side, in plan millimetres (unit vector from the house towards the camera) */
function viewSide(v: Extract<View3D, { kind: 'elevation' | 'section' }>, northAngle: number): Point {
  if (v.kind === 'section') return sectionAxes(v).n;
  // True north on the drawing, turned clockwise from up (-y) by the site's north angle
  const r = (northAngle * Math.PI) / 180;
  const north: Point = [Math.sin(r), -Math.cos(r)];
  const turn = { north: 0, east: 90, south: 180, west: 270 }[v.side];
  const t = (turn * Math.PI) / 180;
  return [north[0] * Math.cos(t) - north[1] * Math.sin(t), north[0] * Math.sin(t) + north[1] * Math.cos(t)];
}

export function OrthoView({ view3d, box }: { view3d: Extract<View3D, { kind: 'elevation' | 'section' }>; box: THREE.Box3 }) {
  const project = useEditor(s => s.project);
  const projectId = useEditor(s => s.projectId);
  const setPlanUntil3D = useEditor(s => s.setPlanUntil3D);
  const store = useEditorStore();
  const { gl, size, invalidate } = useThree();
  const doc = useCanvasDocument();
  const ink = themeColor('--foreground', doc);
  const side = viewSide(view3d, project.site.northAngle);
  const v = new THREE.Vector3(side[0], 0, side[1]);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), v).normalize();
  const center = box.getCenter(new THREE.Vector3());
  // A section looks at its line: the camera's target is on the cut plane
  if (view3d.kind === 'section') {
    const a = new THREE.Vector3(view3d.a[0] * M, 0, view3d.a[1] * M);
    center.sub(v.clone().multiplyScalar(center.clone().sub(a).dot(v)));
  }
  // Fit: the house's extent across the view and its height
  const corners = [box.min, box.max].flatMap(x => [box.min, box.max].flatMap(y => [box.min, box.max].map(z => new THREE.Vector3(x.x, y.y, z.z))));
  const across = corners.map(c => c.clone().sub(center).dot(right));
  const width = Math.max(...across) - Math.min(...across),
    height = box.max.y - box.min.y;
  const zoom = Math.min(size.width / (width * 1.3), size.height / (height * 1.6));
  const distance = Math.max(width, height) * 3 + 20;
  const position = center.clone().add(v.clone().multiplyScalar(distance));

  useEffect(() => {
    setPlanUntil3D(false);
    // Back to the perspective view (not to the plan) without replaying the house growing out of the plan
    return () => {
      if (store.getState().view.mode === '3d') resumeOrbit.add(projectId);
    };
  }, []);

  // A section clips away everything on the viewer's side of the line
  const cuts = useMemo(() => (view3d.kind === 'section' ? sectionCuts(project, view3d) : []), [project, view3d]);
  useEffect(() => {
    if (view3d.kind !== 'section') return;
    const a = new THREE.Vector3(view3d.a[0] * M, 0, view3d.a[1] * M);
    gl.clippingPlanes = [new THREE.Plane(v.clone().negate(), a.dot(v))];
    invalidate();
    return () => {
      gl.clippingPlanes = [];
      invalidate();
    };
  }, [view3d, gl]);

  // Datums run across the view just in front of the house (a section's on its plane), labels on their left ends
  const front = view3d.kind === 'section' ? -0.002 : Math.max(...corners.map(c => c.clone().sub(center).dot(v))) + 0.05;
  const left = Math.min(...across) - 0.5,
    rightEnd = Math.max(...across) + 0.5;
  const at = (s: number, y: number, off = front) => center.clone().add(right.clone().multiplyScalar(s)).setY(y).add(v.clone().multiplyScalar(off));
  const sectionOrigin = view3d.kind === 'section' ? new THREE.Vector3(view3d.a[0] * M, 0, view3d.a[1] * M) : null;
  const d = view3d.kind === 'section' ? sectionAxes(view3d).d : null;

  return (
    <>
      <OrthographicCamera makeDefault position={position} zoom={zoom} near={0.1} far={distance * 4} />
      {/* Not turned: a drag (one finger) pans, the wheel or a pinch zooms */}
      <OrbitControls
        makeDefault
        target={center}
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning
        mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
      {/* The cut walls and floors, filled solid on the plane, a hair behind it so they aren't clipped */}
      {sectionOrigin &&
        d &&
        cuts.map((c, i) => {
          const mid = sectionOrigin
            .clone()
            .add(new THREE.Vector3(d[0], 0, d[1]).multiplyScalar(((c.s0 + c.s1) / 2) * M))
            .setY(((c.y0 + c.y1) / 2) * M)
            .add(v.clone().multiplyScalar(-0.001));
          return (
            <mesh
              key={i}
              position={mid}
              quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v)}
              userData={{ noEdges: true }}
              renderOrder={5}
            >
              <planeGeometry args={[(c.s1 - c.s0) * M, (c.y1 - c.y0) * M]} />
              <meshBasicMaterial color={ink} side={THREE.DoubleSide} />
            </mesh>
          );
        })}
      {project.levels.map(l => {
        const y = l.elevation * M;
        return (
          <group key={l.id}>
            <Line points={[at(left, y), at(rightEnd, y)]} color={ink} lineWidth={1} dashed dashSize={0.3} gapSize={0.15} userData={{ noEdges: true }} />
            {/* The label sits on the line's left end, above it, so it stays on screen on a narrow phone */}
            <Html position={at(left, y)} zIndexRange={[20, 10]} style={{ transform: 'translate(0, -100%)', pointerEvents: 'none' }}>
              <div style={{ font: '11px var(--font-mono)', color: 'var(--foreground)', whiteSpace: 'nowrap', paddingBottom: 2 }}>
                {elevationLabel(l.elevation)} {l.name}
              </div>
            </Html>
          </group>
        );
      })}
    </>
  );
}
