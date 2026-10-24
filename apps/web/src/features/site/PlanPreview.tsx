/** Read-only plan thumbnail (landing page, plan list) */
import type { Project } from '@plinth/core';
import { useMemo } from 'react';
import { levelShapes } from '@/graphics/plan/plan-geometry';
import { m } from '@/lib/i18n';
import { useBuildsVersion } from '@/lib/builds';

export function PlanPreview({ project, level, className }: { project: Project; level?: string; className?: string }) {
  const lv = level ?? project.levels.find(l => !l.roof)?.id ?? 'L1';
  const builds = useBuildsVersion();
  const s = useMemo(() => levelShapes(project, lv), [project, lv, builds]);
  const [x0, y0, x1, y1] = s.bounds;
  const pad = 600;
  const font = Math.max(220, (x1 - x0) / 40);
  return (
    <svg
      viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`}
      className={className}
      role="img"
      aria-label={m.site_plan_aria({ name: project.name })}
    >
      {s.spaces.map(({ s: sp, d }) => (
        <path key={sp.id} d={d} fill={sp.kind === 'indoor' ? 'var(--card)' : 'var(--muted)'} />
      ))}
      <path d={s.light} fill="var(--muted-foreground)" fillOpacity={0.5} />
      <path d={s.solid} fill="var(--muted-foreground)" />
      <path d={s.bearing} fill="var(--foreground)" />
      {s.openings.map(o =>
        o.lines.map((l, i) => <polyline key={o.id + i} points={l.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--foreground)" strokeWidth={30} />),
      )}
      {s.spaces
        .filter(x => x.s.kind === 'indoor' && x.area > 4)
        .map(({ s: sp, label, area }) => (
          <g key={sp.id} textAnchor="middle" fontFamily="var(--font-sans)">
            <text x={label[0]} y={label[1]} fontSize={font} fill="var(--foreground)">
              {sp.name}
            </text>
            <text x={label[0]} y={label[1] + font * 1.15} fontSize={font * 0.8} fill="var(--muted-foreground)" fontFamily="var(--font-mono)">
              {area.toFixed(1)} m²
            </text>
          </g>
        ))}
    </svg>
  );
}
