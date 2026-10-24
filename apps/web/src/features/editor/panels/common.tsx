/** Labels and small building blocks shared by the side panels. */
import type { ConstraintType, OpeningKind, SpaceKind, WallKind } from '@plinth/core';
import { useState } from 'react';
import { toast } from 'sonner';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
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

/**
 * A number the user can edit in place, as SketchUp's and Revit's property boxes: typed, committed on Enter or leaving the field,
 * and shown again as the model has it (unchanged when the edit is refused). Read-only, it is a plain row. Empty commits null
 * when `empty` allows it (a wall's own height: back to its storey's).
 */
export function NumberRow({
  k,
  value,
  unit,
  onCommit,
  readOnly,
  empty,
  step,
}: {
  k: string;
  value: number | null;
  unit: string;
  onCommit: (v: number | null) => void;
  readOnly?: boolean;
  empty?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (readOnly) return <Row k={k} v={value == null ? (empty ?? '—') : `${value} ${unit}`} />;
  const commit = () => {
    if (draft == null) return;
    const t = draft.trim();
    setDraft(null);
    if (t === '' ? value == null : Number(t) === value) return;
    if (t === '') {
      if (empty != null) onCommit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) onCommit(n);
  };
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <InputGroup className="h-7 w-32">
        <InputGroupInput
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          className="text-right font-mono"
          value={draft ?? (value == null ? '' : String(value))}
          placeholder={empty}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </label>
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
