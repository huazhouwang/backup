/** Deleting an object from the editor (the Delete key, the props panel's buttons): the capability call that removes it */
import { findObject, type Project } from '@plinth/core';

/** The call that removes an object, or null for what can't be removed this way (bearing walls, elements, levels) */
export function removeCall(p: Project, id: string): { name: string; input: Record<string, unknown> } | null {
  const e = findObject(p, id);
  switch (e?.kind) {
    case 'furniture':
      return { name: 'furniture_remove', input: { furniture: id } };
    case 'opening':
      return { name: 'opening_remove', input: { opening: id } };
    case 'wall':
      return e.obj.kind === 'bearing' ? null : { name: 'wall_remove', input: { wall: id } };
    case 'space':
      return { name: 'space_remove', input: { space: id } };
    case 'guide':
      return { name: 'guide_remove', input: { guides: [id] } };
    default:
      return null;
  }
}
