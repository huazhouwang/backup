/**
 * What a widget looks like at work (issue 204): run with its default parameters on the sample house, in the sandbox. A tool is
 * drawn over the plan, as the canvas draws it; an effect as a still of the 3D view (graphics/three/widget-still.ts): rain, snow,
 * night.
 */
import { isEffect, migrate, runWidget, type LibraryOrigin, type WidgetDef, type WidgetItem } from '@opensu/core';
import { useEffect, useState } from 'react';
import sampleJson from '../../../../../samples/wushi-10/project.json';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanPreview } from '@/features/site/PlanPreview';
import { m, uiName } from '@/lib/i18n';
// Lets core start the sandbox when the widget runs
import '@/features/editor/widgets/sandbox';

const sample = migrate(sampleJson);
const ground = [...sample.levels].sort((a, b) => a.elevation - b.elevation)[0].id;

export function WidgetPreview({ origin, id, def }: { origin: LibraryOrigin; id: string; def: WidgetDef }) {
  const [src, setSrc] = useState<string | null>(null);
  const [tool, setTool] = useState<WidgetItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await runWidget(origin, id, def, sample, {}, { level: ground, view: '3d', language: sample.language });
      if (!r.ok) return live && setFailed(true);
      if (!r.items.some(isEffect)) return live && setTool(r.items);
      const { renderWidgetStill } = await import('@/graphics/three/widget-still');
      const url = await renderWidgetStill(sample, r.items, ground, { width: 640, height: 400 });
      if (live) setSrc(url);
    })().catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id, def.version]);
  if (failed) return null;
  if (tool)
    return (
      <PlanPreview project={sample} level={ground} className="aspect-[8/5] w-full rounded-md border bg-background">
        <g data-widget-preview={id} stroke="var(--canvas-widget)" fill="var(--canvas-widget)">
          {tool.map((i, n) =>
            i.type === 'line' ? (
              <line key={n} x1={i.from[0]} y1={i.from[1]} x2={i.to[0]} y2={i.to[1]} strokeWidth={40} strokeDasharray={i.dash?.join(' ')} />
            ) : i.type === 'area' ? (
              <polygon key={n} points={i.outline.map(p => p.join(',')).join(' ')} fillOpacity={0.12} strokeWidth={30} />
            ) : i.type === 'point' || i.type === 'handle' ? (
              <circle key={n} cx={i.at[0]} cy={i.at[1]} r={120} stroke="none" />
            ) : i.type === 'label' ? (
              <text key={n} x={i.at[0]} y={i.at[1]} fontSize={360} stroke="none" textAnchor="middle" fontFamily="var(--font-mono)">
                {i.text}
              </text>
            ) : null,
          )}
        </g>
      </PlanPreview>
    );
  return src ? (
    <img
      src={src}
      alt={m.widget_preview_alt({ name: uiName(def.name) })}
      className="aspect-[8/5] w-full rounded-md border object-cover"
      data-widget-preview={id}
    />
  ) : (
    <Skeleton className="aspect-[8/5] w-full" />
  );
}
