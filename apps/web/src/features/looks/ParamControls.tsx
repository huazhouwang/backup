/**
 * Controls for a look's parameters, picked from each declaration (JSON Schema keywords, see packages/core/src/looks/script.ts): a
 * material picker with swatches, a select for a closed set of values, show/hide for a boolean, a number field with its range
 * (empty means automatic when the script may work it out). Used by the properties panel and by a look's page in its library.
 */
import { DEFAULT_MATERIALS, materialOf, paramTypes, type Material, type ParamDecl, type ParamValue, type Recipe } from '@plinth/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m, uiName } from '@/lib/i18n';
import { materialStyle } from '@/lib/materials';

/** A parameter's name for people: its title, else its key */
export const paramTitle = (name: string, d: ParamDecl) => uiName(d.title) || name;

/** How a parameter value reads: a material's name, an enum value's title, shown/hidden, automatic, or the value */
export function paramText(d: ParamDecl, v: ParamValue, recipe?: Pick<Recipe, 'materials'> | null, design?: Record<string, Material>): string {
  if (v === null) return m.looks_param_auto();
  if (typeof v === 'boolean') return v ? m.looks_param_on() : m.looks_param_off();
  if (d.format === 'material' && typeof v === 'string') return uiName(materialOf(v, recipe, design)?.name) || v;
  const i = d.enum?.indexOf(v) ?? -1;
  return (i >= 0 && uiName(d.enumTitles?.[i])) || String(v);
}

export function Swatch({ material }: { material: Material | undefined }) {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-full border" style={{ background: materialStyle(material).color }} />;
}

/** The values a select offers for a parameter, or null for a free field */
function choices(d: ParamDecl, recipe?: Pick<Recipe, 'materials'> | null, design?: Record<string, Material>): ParamValue[] | null {
  if (d.enum) return d.enum;
  if (d.format === 'material') return [...new Set([...Object.keys(recipe?.materials ?? {}), ...Object.keys(design ?? {}), ...Object.keys(DEFAULT_MATERIALS)])];
  if (paramTypes(d).includes('boolean')) return [true, false];
  return null;
}

export interface ParamControlsProps {
  params: Record<string, ParamDecl>;
  /** Values set (the declaration's default for the rest) */
  values: Record<string, ParamValue | undefined>;
  /** null: back to the default */
  onChange: (name: string, value: ParamValue) => void;
  recipe?: Pick<Recipe, 'materials'> | null;
  design?: Record<string, Material>;
  /** Rows of values instead of controls */
  readOnly?: boolean;
}

export function ParamControls({ params, values, onChange, recipe, design, readOnly }: ParamControlsProps) {
  return Object.entries(params).map(([name, d]) => {
    const own = values[name];
    const value = own !== undefined ? own : d.default;
    const label = paramTitle(name, d);
    const text = (v: ParamValue) => paramText(d, v, recipe, design);
    const swatch = (v: ParamValue) => d.format === 'material' && typeof v === 'string' && <Swatch material={materialOf(v, recipe, design)} />;
    if (readOnly) {
      return (
        <div key={name} className="flex justify-between gap-3 py-1 text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="flex items-center gap-1.5 text-right">
            {swatch(value)}
            {text(value)}
          </span>
        </div>
      );
    }
    const options = choices(d, recipe, design);
    const types = paramTypes(d);
    return (
      <div key={name} className="space-y-1" data-param={name}>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>{label}</span>
          {own !== undefined && (
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onChange(name, null)}>
              {m.looks_param_reset()}
            </Button>
          )}
        </div>
        {options ? (
          <Select value={JSON.stringify(value)} onValueChange={v => onChange(name, JSON.parse(v as string))}>
            <SelectTrigger className="w-full" aria-label={label}>
              <SelectValue>
                {swatch(value)} {text(value)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(options.includes(value) ? options : [value, ...options]).map(o => (
                <SelectItem key={JSON.stringify(o)} value={JSON.stringify(o)}>
                  {swatch(o)} {text(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : types.includes('number') || types.includes('integer') ? (
          <Input
            key={String(value)}
            type="number"
            aria-label={label}
            defaultValue={value === null ? '' : String(value)}
            placeholder={types.includes('null') ? m.looks_param_auto() : undefined}
            min={d.minimum}
            max={d.maximum}
            step={types.includes('integer') ? 1 : undefined}
            onBlur={ev => {
              const v = ev.target.value.trim() === '' ? (types.includes('null') ? null : d.default) : Number(ev.target.value);
              if (v !== value && (v === null || Number.isFinite(v))) onChange(name, v === d.default && own === undefined ? null : v);
            }}
            onKeyDown={ev => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
          />
        ) : (
          <Input
            key={String(value)}
            aria-label={label}
            defaultValue={String(value ?? '')}
            onBlur={ev => ev.target.value !== value && onChange(name, ev.target.value)}
            onKeyDown={ev => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
          />
        )}
      </div>
    );
  });
}

/** A material picker with swatches: the design's own materials and the default library's (a floor, a wall's finish) */
export function MaterialSelect({
  value,
  onChange,
  design,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  design?: Record<string, Material>;
  label: string;
}) {
  const ids = [...new Set([value, ...Object.keys(design ?? {}), ...Object.keys(DEFAULT_MATERIALS)])];
  const name = (id: string) => uiName(materialOf(id, null, design)?.name) || id;
  return (
    <Select value={value} onValueChange={v => v && onChange(v as string)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue>
          <Swatch material={materialOf(value, null, design)} /> {name(value)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ids.map(id => (
          <SelectItem key={id} value={id}>
            <Swatch material={materialOf(id, null, design)} /> {name(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
