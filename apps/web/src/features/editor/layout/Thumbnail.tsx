import { type Project } from '@plinth/core';
import { useEffect, useRef, useState } from 'react';
import { PlanPreview } from '@/features/site/PlanPreview';
import { api } from '@/lib/api';
import { standaloneSvg } from '@/lib/theme';
import { useEditor } from '../store';

/**
 * Upload a thumbnail for the design list after each save (and on opening): a still of the house in 3D, or the plan when 3D can't
 * be drawn
 */
export function Thumbnail() {
  const version = useEditor(s => s.version);
  const projectId = useEditor(s => s.projectId);
  const canEdit = useEditor(s => s.canEdit());
  const session = useEditor(s => s.session);
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Project | null>(null);
  useEffect(() => {
    if (!canEdit) return;
    const t = setTimeout(() => setSnap(session.project), 2000);
    return () => clearTimeout(t);
  }, [version]);
  useEffect(() => {
    const svg = ref.current?.querySelector('svg');
    if (!snap || !svg) return;
    const put = (body: string, type: string) =>
      body.length < 290_000 && api(`/projects/${projectId}/thumbnail`, { method: 'PUT', body, headers: { 'Content-Type': type } });
    const plan = standaloneSvg(svg);
    void import('@/graphics/three/house-still')
      .then(({ renderHouseStill }) => renderHouseStill(snap))
      .then(
        jpeg => put(jpeg, 'text/plain'),
        () => put(plan, 'image/svg+xml'),
      )
      .catch(() => {});
  }, [snap]);
  return snap ? (
    <div ref={ref} className="hidden" aria-hidden>
      <PlanPreview project={snap} />
    </div>
  ) : null;
}
