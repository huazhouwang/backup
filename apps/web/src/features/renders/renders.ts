/**
 * Making style renders (issue 195) in the browser: for each shot of the design, the passes from the 3D model (only those the
 * deployment's image provider takes), the style's prompt for outside or inside, then the server makes and keeps the image. Used
 * by the styles panel and by the agent's render_style; progress is shared so both show the same set being made.
 */
import { autoShots, stylePrompt, type Project, type Shot, type StylePreset } from '@opensu/core';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { m, uiName } from '@/lib/i18n';
import type { RenderConfig, RenderInfo } from '@/shared/renders';

export const renderConfig = () => api<RenderConfig>('/render-config');
export const listRenders = (projectId: string) => api<RenderInfo[]>(`/projects/${projectId}/renders`);

/** The set being made: which style, how many done of how many */
export type RenderJob = { style: string; done: number; total: number } | null;
let job: RenderJob = null;
const listeners = new Set<() => void>();
const setJob = (j: RenderJob) => {
  job = j;
  listeners.forEach(l => l());
};
export const useRenderJob = () =>
  useSyncExternalStore(
    l => (listeners.add(l), () => listeners.delete(l)),
    () => job,
  );

/** The shots a set takes: the aerial, the street and the largest rooms */
export const shotsFor = (p: Project, count = 4): Shot[] => autoShots(p, { rooms: Math.max(0, count - 2) }).slice(0, count);

/**
 * Render a design in a style, shot by shot; each image is reported as it arrives. Stops at the first failure (out of credits,
 * the provider failing) and throws it, keeping the images already made.
 */
export async function renderStyle(projectId: string, project: Project, style: StylePreset, shots: Shot[], onImage?: (r: RenderInfo) => void) {
  if (job) throw new Error(m.render_busy());
  const [config, { renderPasses, PASS_SIZE }] = await Promise.all([renderConfig(), import('@/graphics/three/render-passes')]);
  const made: RenderInfo[] = [];
  setJob({ style: style.id, done: 0, total: shots.length });
  try {
    for (const shot of shots) {
      const all = await renderPasses(project, shot);
      const passes = Object.fromEntries(['color', ...config.passes].map(p => [p, all[p as keyof typeof all]]));
      const { prompt, negative } = stylePrompt(style, shot.kind === 'room');
      const r = await api<RenderInfo>(`/projects/${projectId}/renders`, {
        method: 'POST',
        json: {
          style: style.id,
          styleName: uiName(style.name),
          palette: style.palette,
          shot: shot.id,
          shotName: shot.name,
          prompt,
          negative,
          width: PASS_SIZE.width,
          height: PASS_SIZE.height,
          passes,
        },
      });
      made.push(r);
      onImage?.(r);
      setJob({ style: style.id, done: made.length, total: shots.length });
    }
    return made;
  } finally {
    setJob(null);
  }
}
