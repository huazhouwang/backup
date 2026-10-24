import { area } from '../geometry/geometry.js';
import { text } from '../i18n.js';
import { materialOf } from '../looks/builtin.js';
import type { Project } from './schema.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Structural validation: unique IDs, existing references, valid geometry. Rule checks (door swing, room overlap, etc.) are roadmap step 2. */
export function validate(p: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, string>();
  const claim = (id: string, path: string) => {
    if (ids.has(id)) issues.push({ path, message: text('validate_duplicate_id', 'ID {id} duplicates {other}', { id, other: ids.get(id)! }) });
    else ids.set(id, path);
  };
  const levels = new Set(p.levels.map(l => l.id));
  const lib = p.library;

  if (p.language !== 'zh' && p.language !== 'en')
    issues.push({ path: 'language', message: text('validate_language', 'Invalid project language {language}', { language: String(p.language) }) });
  p.levels.forEach((l, i) => claim(l.id, `levels[${i}]`));
  p.walls.forEach((w, i) => {
    const at = `walls[${i}] (${w.name})`;
    claim(w.id, at);
    if (!levels.has(w.level)) issues.push({ path: at, message: text('validate_missing_level', 'Level {level} does not exist', { level: w.level }) });
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
    if (len <= 0) issues.push({ path: at, message: text('validate_zero_length', 'Wall length is 0') });
    if (w.thickness <= 0) issues.push({ path: at, message: text('validate_thickness', 'Wall thickness must be greater than 0') });
    if (w.finish && !materialOf(w.finish, null, p.library.materials))
      issues.push({ path: at, message: text('validate_unknown_material', 'Material {material} is not registered', { material: w.finish }) });
    w.openings.forEach((o, j) => {
      claim(o.id, `${at}.openings[${j}]`);
      if (o.at - o.width / 2 < -1 || o.at + o.width / 2 > len + 1)
        issues.push({ path: `${at}.openings[${j}] (${o.name})`, message: text('validate_opening_outside', 'Opening extends beyond the wall') });
    });
  });
  p.spaces.forEach((s, i) => {
    const at = `spaces[${i}] (${s.name})`;
    claim(s.id, at);
    if (!levels.has(s.level)) issues.push({ path: at, message: text('validate_missing_level', 'Level {level} does not exist', { level: s.level }) });
    if (!materialOf(s.floor, null, lib.materials))
      issues.push({ path: at, message: text('validate_unknown_material', 'Material {material} is not registered', { material: s.floor }) });
    if (area(s.shape) <= 0) issues.push({ path: at, message: text('validate_zero_area', 'Shape area is 0') });
  });
  p.elements.forEach((e, i) => {
    const at = `elements[${i}] (${e.name})`;
    claim(e.id, at);
    if (!levels.has(e.level) || (e.topLevel && !levels.has(e.topLevel)))
      issues.push({ path: at, message: text('validate_level_missing', 'Level does not exist') });
    if (!(e.type in lib.elements))
      issues.push({ path: at, message: text('validate_unknown_element', 'Element type {type} is not registered', { type: e.type }) });
  });
  p.furniture.forEach((f, i) => {
    const at = `furniture[${i}] (${f.name})`;
    claim(f.id, at);
    if (!levels.has(f.level)) issues.push({ path: at, message: text('validate_missing_level', 'Level {level} does not exist', { level: f.level }) });
    if (!(f.type in lib.furniture))
      issues.push({ path: at, message: text('validate_unknown_furniture', 'Furniture type {type} is not registered', { type: f.type }) });
  });
  // Looks: references must exist (a missing look would silently fall back to the default)
  const looks = lib.looks ?? {};
  for (const [target, id] of Object.entries(lib.use ?? {}))
    if (!looks[id]) issues.push({ path: `library.use.${target}`, message: text('validate_unknown_look', 'Look {look} does not exist', { look: id }) });
  for (const o of [...p.furniture, ...p.elements, ...p.walls.flatMap(w => w.openings)])
    if (o.look && !looks[o.look]) issues.push({ path: `${o.name}`, message: text('validate_unknown_look', 'Look {look} does not exist', { look: o.look }) });
  return issues;
}
