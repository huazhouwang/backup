/**
 * What the mouse is over in the plan or the 3D view, as Revit's pre-selection: the object outlined in the selection colour and a
 * tooltip naming it (see HoverTip). Touch has no hover, so it stays empty there.
 */
import { useSyncExternalStore } from 'react';

export type Hover = { id: string; x: number; y: number } | null;

let hover: Hover = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

export function setHover(h: Hover) {
  if (h?.id === hover?.id && h?.x === hover?.x && h?.y === hover?.y) return;
  hover = h;
  subs.forEach(f => f());
}

export const useHover = () => useSyncExternalStore(subscribe, () => hover);
/** Whether the mouse is over this object (re-renders only when that changes) */
export const useHovered = (id: string) => useSyncExternalStore(subscribe, () => hover?.id === id);
