/**
 * The variants a look's page shows, like a component's stories: one parameter changed at a time, the others at their defaults.
 * Generated from the declarations (JSON Schema keywords), never written per look.
 */
import { paramTypes, type ParamDecl, type ParamValue } from '@plinth/core';

/** Which value a variant shows, for its caption: the range's ends, the default, automatic, or one of a set */
export type VariantRole = 'min' | 'default' | 'max' | 'auto' | 'value';

/**
 * The values to show for a parameter: every value of a closed set (enum, including the materials it offers), on and off for a
 * boolean, the range's ends and the default for a number (and automatic when the script may work it out); none for a free
 * value (a material without choices, a string), which only the controls change
 */
export function paramVariants(d: ParamDecl): { value: ParamValue; role: VariantRole }[] {
  const types = paramTypes(d);
  if (d.enum) return d.enum.map(value => ({ value, role: value === d.default ? 'default' : 'value' }));
  if (types.includes('boolean')) return [true, false].map(value => ({ value, role: value === d.default ? 'default' : 'value' }));
  if (types.includes('number') || types.includes('integer')) {
    const out: { value: ParamValue; role: VariantRole }[] = [];
    if (d.minimum !== undefined && d.minimum !== d.default) out.push({ value: d.minimum, role: 'min' });
    out.push({ value: d.default, role: d.default === null ? 'auto' : 'default' });
    if (d.maximum !== undefined && d.maximum !== d.default) out.push({ value: d.maximum, role: 'max' });
    if (types.includes('null') && d.default !== null) out.push({ value: null, role: 'auto' });
    return out.length > 1 ? out : [];
  }
  return [];
}

/** Narrower, the usual and wider: the width scaled, depth and height kept */
export const sizeVariants = (s: { w: number; d: number; h: number }) => [
  { size: { ...s, w: Math.round(s.w * 0.7) }, role: 'narrow' as const },
  { size: s, role: 'default' as const },
  { size: { ...s, w: Math.round(s.w * 1.4) }, role: 'wide' as const },
];
