/** What the property panel's parts share */
import type { ObjectInfo } from '@plinth/core';
import { m } from '@/lib/i18n';

export type Info<T extends ObjectInfo['type']> = Extract<ObjectInfo, { type: T }>;

export const TYPE_LABEL: Partial<Record<ObjectInfo['type'], () => string>> = {
  space: m.panels_type_space,
  wall: m.panels_type_wall,
  opening: m.panels_type_opening,
  furniture: m.panels_type_furniture,
  element: m.panels_type_element,
};

export const FOLLOW = '__follow__';
