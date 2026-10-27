/**
 * What the installed widgets draw in the plan (see outputs.ts), in the widget colour: lines (dashes in screen pixels), labels,
 * points and areas, which don't take the pointer; and handles, which an editor drags to move the two params they stand for. The
 * handle follows the pointer through `onPreview` (the widget runs again with those values) and releasing commits the change.
 */
import type { ParamValue, Point } from '@opensu/core';
import { useRef } from 'react';
import { m } from '@/lib/i18n';
import { itemsOn, type WidgetOutput } from './outputs';

/** Handles move on a 50 mm step, like dragging anything else in the plan */
const STEP = 50;
const snap = (v: number) => Math.round(v / STEP) * STEP;

export function PlanWidgets({
  outputs,
  level,
  pxMm,
  toMm,
  editable,
  onPreview,
  onCommit,
}: {
  outputs: WidgetOutput[];
  level: string;
  /** Millimetres per screen pixel */
  pxMm: number;
  toMm: (e: React.PointerEvent) => Point;
  editable: boolean;
  /** Params standing in while a handle is dragged (null when the drag ends without a change) */
  onPreview: (widget: string, params: Record<string, ParamValue> | null) => void;
  /** The drag ended with a change: make it (and stop the preview once it is made) */
  onCommit: (widget: string, params: Record<string, ParamValue>) => void;
}) {
  const dragging = useRef<{ widget: string; x: string; y: string; pointerId: number; last: Record<string, ParamValue> | null } | null>(null);
  const items = itemsOn(outputs, level, level);
  const color = 'var(--canvas-widget)';

  const paramsAt = (d: NonNullable<typeof dragging.current>, e: React.PointerEvent) => {
    const [x, y] = toMm(e);
    return { [d.x]: snap(x), [d.y]: snap(y) };
  };

  return (
    <g data-widgets>
      <g pointerEvents="none">
        {items.map(({ widget, item }, i) => {
          const key = `${widget}-${i}`;
          switch (item.type) {
            case 'line':
              return (
                <line
                  key={key}
                  x1={item.from[0]}
                  y1={item.from[1]}
                  x2={item.to[0]}
                  y2={item.to[1]}
                  stroke={color}
                  strokeWidth={1}
                  strokeDasharray={item.dash?.map(d => d * pxMm).join(' ')}
                  vectorEffect="non-scaling-stroke"
                  data-widget={widget}
                  data-widget-item="line"
                />
              );
            case 'label':
              return (
                <text
                  key={key}
                  x={item.at[0]}
                  y={item.at[1]}
                  fontSize={11 * pxMm}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={color}
                  fontFamily="var(--font-mono)"
                  paintOrder="stroke"
                  stroke="var(--canvas-backdrop)"
                  strokeWidth={3 * pxMm}
                  data-widget={widget}
                  data-widget-item="label"
                >
                  {item.text}
                </text>
              );
            case 'point':
              return <circle key={key} cx={item.at[0]} cy={item.at[1]} r={2.5 * pxMm} fill={color} data-widget={widget} data-widget-item="point" />;
            case 'area':
              return (
                <path
                  key={key}
                  d={`M${item.outline.map(p => p.join(',')).join('L')}Z`}
                  fill={color}
                  fillOpacity={0.08}
                  stroke={color}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  data-widget={widget}
                  data-widget-item="area"
                />
              );
            default:
              return null;
          }
        })}
      </g>
      {editable &&
        items.map(({ widget, item }) =>
          item.type === 'handle' ? (
            <circle
              // Keyed by what it moves, not its place in the list: the list changes while it is dragged, and a remounted
              // handle would lose the pointer
              key={`${widget}-${item.x}-${item.y}`}
              cx={item.at[0]}
              cy={item.at[1]}
              r={7 * pxMm}
              fill="var(--background)"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className="plan-drag cursor-move"
              style={{ touchAction: 'none' }}
              aria-label={m.widget_handle()}
              data-widget={widget}
              data-widget-handle={`${item.x},${item.y}`}
              onPointerDown={e => {
                if (e.button !== 0) return;
                e.stopPropagation();
                (e.target as Element).setPointerCapture(e.pointerId);
                dragging.current = { widget, x: item.x, y: item.y, pointerId: e.pointerId, last: null };
              }}
              onPointerMove={e => {
                const d = dragging.current;
                if (!d || d.pointerId !== e.pointerId) return;
                const next = paramsAt(d, e);
                if (JSON.stringify(next) === JSON.stringify(d.last)) return;
                d.last = next;
                onPreview(d.widget, next);
              }}
              onPointerUp={e => {
                const d = dragging.current;
                if (!d || d.pointerId !== e.pointerId) return;
                dragging.current = null;
                if (d.last) onCommit(d.widget, d.last);
                else onPreview(d.widget, null);
              }}
              onPointerCancel={() => {
                const d = dragging.current;
                dragging.current = null;
                if (d) onPreview(d.widget, null);
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : null,
        )}
    </g>
  );
}
