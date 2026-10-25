/**
 * Guides on the plan (see plan-guides.ts): dashed lines across the drawing and small crosses for points; a click selects one (so
 * Delete removes it), drawn blue while selected.
 */
import type { Project } from '@plinth/core';
import { clipLine, planGuideLines, planGuidePoints } from './plan-guides';

export function PlanGuides({
  project,
  frame,
  selected,
  pick,
  pxMm,
}: {
  project: Project;
  frame: { x: number; y: number; w: number; h: number };
  selected: Set<string>;
  /** Selecting a guide; none while a tool takes the clicks */
  pick?: (id: string) => (e: React.MouseEvent) => void;
  pxMm: number;
}) {
  // Beyond the frame too, for zooming out
  const box: [number, number, number, number] = [frame.x - frame.w, frame.y - frame.h, frame.w * 3, frame.h * 3];
  const ink = (id: string) => (selected.has(id) ? 'var(--chart-2)' : 'var(--muted-foreground)');
  const r = 5 * pxMm;
  return (
    <g data-guides>
      {planGuideLines(project).map(l => {
        const seg = clipLine(l, box);
        if (!seg) return null;
        const [a, b] = seg;
        return (
          <g key={l.id}>
            <line
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              stroke={ink(l.id)}
              strokeWidth={selected.has(l.id) ? 1.5 : 1}
              strokeDasharray="8 5"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {pick && (
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="transparent"
                strokeWidth={10}
                vectorEffect="non-scaling-stroke"
                className="cursor-pointer"
                data-guide={l.id}
                onClick={pick(l.id)}
              />
            )}
          </g>
        );
      })}
      {planGuidePoints(project).map(g => (
        <g key={g.id} stroke={ink(g.id)} strokeWidth={1.5} pointerEvents="none">
          <line x1={g.at[0] - r} y1={g.at[1] - r} x2={g.at[0] + r} y2={g.at[1] + r} vectorEffect="non-scaling-stroke" />
          <line x1={g.at[0] - r} y1={g.at[1] + r} x2={g.at[0] + r} y2={g.at[1] - r} vectorEffect="non-scaling-stroke" />
          {pick && (
            <circle
              cx={g.at[0]}
              cy={g.at[1]}
              r={r * 1.6}
              fill="transparent"
              stroke="none"
              pointerEvents="all"
              className="cursor-pointer"
              data-guide={g.id}
              onClick={pick(g.id)}
            />
          )}
        </g>
      ))}
    </g>
  );
}
