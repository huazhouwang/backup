/**
 * What moves as the walker comes near, while walking: objects whose look declares it (Interaction in the core's script.ts, e.g.
 * the doors that open), each with its parameter's value in tenths (0 at rest … 1) and whether it lets the walker through yet. The
 * walker sets them (see WalkView) and the renderer builds those looks at that value. A plain shared value, as it changes while
 * they move.
 */
import { useSyncExternalStore } from 'react';

const moving = new Map<string, { value: number; passable: boolean }>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};

export function setMoving(id: string, value: number, passable: boolean) {
  const was = moving.get(id);
  if ((was?.value ?? 0) === value && (was?.passable ?? false) === passable) return;
  if (value) moving.set(id, { value, passable });
  else moving.delete(id);
  changed();
}

export function restAll() {
  if (!moving.size) return;
  moving.clear();
  changed();
}

/** How far an object has moved (its look's interaction parameter), 0 at rest */
export const movedBy = (id: string) => moving.get(id)?.value ?? 0;

/** The objects that let the walker through now */
export const passable = (): Set<string> => new Set([...moving].filter(([, m]) => m.passable).map(([id]) => id));

/** Re-renders when something moves */
export const useMoving = () =>
  useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
