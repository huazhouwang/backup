/** Labels and small building blocks shared by the side panels. */
import type { ConstraintType, OpeningKind, SpaceKind, WallKind } from '@plinth/core';
import { toast } from 'sonner';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

/** Typed per kind list, so a kind added to the schema without a label is a compile error */
const WALL_KIND_LABEL: Record<WallKind, () => string> = {
  bearing: m.panels_kind_bearing,
  partition: m.panels_kind_partition,
  fence: m.panels_kind_fence,
  parapet: m.panels_kind_parapet,
  railing: m.panels_kind_railing,
};
const SPACE_KIND_LABEL: Record<SpaceKind, () => string> = {
  indoor: m.panels_kind_indoor,
  'semi-outdoor': m.panels_kind_semi_outdoor,
  outdoor: m.panels_kind_outdoor,
  'roof-terrace': m.panels_kind_roof_terrace,
  void: m.panels_kind_void,
};
const OPENING_KIND_LABEL: Record<OpeningKind, () => string> = {
  door: m.panels_kind_door,
  'sliding-door': m.panels_kind_sliding_door,
  gate: m.panels_kind_gate,
  window: m.panels_kind_window,
  opening: m.panels_kind_opening,
};
const KIND_LABEL: Record<string, () => string> = { ...WALL_KIND_LABEL, ...SPACE_KIND_LABEL, ...OPENING_KIND_LABEL };
export const kindLabel = (k: string) => KIND_LABEL[k]?.() ?? k;

const CONSTRAINT_LABEL: Record<ConstraintType, () => string> = {
  align: m.panels_constraint_align,
  center: m.panels_constraint_center,
  spacing: m.panels_constraint_spacing,
  'size-target': m.panels_constraint_size_target,
  reference: m.panels_constraint_reference,
  rule: m.panels_constraint_rule,
};
export const constraintLabel = (t: ConstraintType) => CONSTRAINT_LABEL[t]?.() ?? t;

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-mono">{v}</span>
    </div>
  );
}

/** Call a capability as the user and show the reason in a toast when it fails */
export function useRun() {
  const call = useEditor(s => s.call);
  return async (name: string, input: unknown) => {
    const r = await call(name, input);
    if (!r.ok) toast.error(r.error?.message ?? m.panels_action_failed());
    return r;
  };
}
