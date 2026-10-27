/**
 * Revit's pre-selection tooltip: after a short pause over an object, its category and name under the cursor (e.g. Bearing wall :
 * North wall).
 */
import { findObject, type Project } from '@opensu/core';
import { useEffect, useState } from 'react';
import { useEditor } from './store';
import { useHover } from './hover';
import { kindLabel } from './panels/common';

const PAUSE = 500;

/** "category : name" for an object */
export function hoverText(p: Project, id: string): string | null {
  const e = findObject(p, id);
  if (!e) return null;
  const o = e.obj as { kind?: string; type?: string; name: string };
  const category = e.kind === 'furniture' ? (p.library.furniture[o.type ?? '']?.name ?? o.type) : o.kind ? kindLabel(o.kind) : null;
  return category && category !== o.name ? `${category} : ${o.name}` : o.name;
}

export function HoverTip() {
  const hover = useHover();
  const project = useEditor(s => s.project);
  const [shown, setShown] = useState<string | null>(null);
  // Shown once the pointer has rested on the same object
  useEffect(() => {
    setShown(null);
    if (!hover) return;
    const t = setTimeout(() => setShown(hover.id), PAUSE);
    return () => clearTimeout(t);
  }, [hover?.id]);
  const text = hover && shown === hover.id ? hoverText(project, hover.id) : null;
  if (!hover) return null;
  // What is under the mouse right away, for tests; the tooltip itself waits for the pause
  if (!text) return <span hidden data-hover-id={hover.id} />;
  return (
    <div
      role="tooltip"
      data-hover-tip={hover.id}
      data-hover-id={hover.id}
      className="pointer-events-none fixed z-50 rounded-sm bg-background px-1.5 py-0.5 text-xs whitespace-nowrap text-foreground shadow-sm ring-1 ring-foreground/20"
      style={{ left: hover.x + 12, top: hover.y + 20 }}
    >
      {text}
    </div>
  );
}
