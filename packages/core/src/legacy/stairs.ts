/**
 * The legacy page's stair ("legacy-stair": its parameters copied as they were) becomes proper U-shaped stairs (see elements.ts),
 * one per storey, all in the same stairwell. Used by the v2 → v3 migration and by the legacy conversion.
 */
import { NAME_SEPARATOR } from '../model/names.js';
import type { Element, Level, Project } from '../model/schema.js';
import type { StairParams } from '../geometry/elements.js';

interface LegacyStair {
  footprint?: { x: number; y: number; w: number; h: number };
  /** Flight edges in metres: west flight w0–w1, east flight e0–e1 */
  flights?: { w0: number; w1: number; e0: number; e1: number };
}

const mm = (m: number) => Math.round(m * 1000);

export const STAIR_LIBRARY = { zh: { name: '两跑楼梯', version: 1 }, en: { name: 'U-shaped stair', version: 1 } };

/** One stair per storey from the element's level up to its top level; the first keeps the element's ID */
function split(e: Element, levels: Level[]): Element[] {
  const { footprint: fp, flights: f } = e.params as LegacyStair;
  const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
  const from = sorted.findIndex(l => l.id === e.level);
  const to = e.topLevel ? sorted.findIndex(l => l.id === e.topLevel) : from + 1;
  if (!fp || !f || from < 0 || to <= from) return [e];
  // The legacy page climbs north up the west flight and comes back down the east one
  const params: StairParams = { rect: [mm(f.w0), fp.y, mm(f.e1 - f.w0), fp.h], up: 'north', turn: 'right', gap: mm(f.e0 - f.w1) };
  return sorted.slice(from, to).map((l, i) => ({
    id: i === 0 ? e.id : `${e.id}-${i + 1}`,
    name: `${e.name}${NAME_SEPARATOR}${l.name}`,
    type: 'stair',
    level: l.id,
    topLevel: sorted[from + i + 1].id,
    params: { ...params } as unknown as Record<string, unknown>,
  }));
}

export function upgradeLegacyStairs<T extends Pick<Project, 'elements' | 'levels' | 'library' | 'language'>>(doc: T): T {
  if (!doc.elements.some(e => e.type === 'legacy-stair')) return doc;
  const elements = doc.elements.flatMap(e => (e.type === 'legacy-stair' ? split(e, doc.levels) : [e]));
  const { 'legacy-stair': _legacy, ...rest } = doc.library.elements;
  const library = elements.some(e => e.type === 'legacy-stair') ? doc.library.elements : rest;
  return {
    ...doc,
    elements,
    library: { ...doc.library, elements: { ...library, stair: library.stair ?? STAIR_LIBRARY[doc.language === 'en' ? 'en' : 'zh'] } },
  };
}
