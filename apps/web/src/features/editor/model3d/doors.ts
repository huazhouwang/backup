/**
 * How far each sliding door stands open while walking (0 closed … 1 open, in steps of a tenth): the walker opens the doors it comes
 * near (see WalkView) and the renderer builds their looks at that opening (the look's `open` parameter). A plain shared value, as
 * it changes while the doors move.
 */
import { useSyncExternalStore } from 'react';

const open = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};

export function setDoorOpen(id: string, v: number) {
  if ((open.get(id) ?? 0) === v) return;
  if (v) open.set(id, v);
  else open.delete(id);
  changed();
}

export function closeAllDoors() {
  if (!open.size) return;
  open.clear();
  changed();
}

export const doorOpen = (id: string) => open.get(id) ?? 0;

/** The doors open far enough to walk through */
export const passableDoors = (): Set<string> => new Set([...open].filter(([, v]) => v >= 0.7).map(([id]) => id));

/** Re-renders when a door moves */
export const useDoors = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
