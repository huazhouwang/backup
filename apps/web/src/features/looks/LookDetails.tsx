import { DEFAULT_TYPES, groupNames, lookGroup, lookSizeOf, names, type LibraryLook, type LookLibrary, type ParamValue } from '@plinth/core';
import { useState } from 'react';
import { sizeText, LookImage } from '@/features/looks/LookCard';
import { ParamControls } from '@/features/looks/ParamControls';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getLocale, m, uiName } from '@/lib/i18n';
import { Variants } from './Variants';

/** What a target is, in the UI language: a furniture type's name, a kind of opening, railings, an element */
export function targetName(lib: LookLibrary, look: LibraryLook, target: string) {
  const [kind, type] = target.split(':'),
    v = names(getLocale() === 'en' ? 'en' : 'zh');
  if (kind === 'furniture') return uiName(look.newType?.name ?? DEFAULT_TYPES[type]?.name) || type;
  if (kind === 'opening') return type === 'glass-block' ? v.glassBlock(v.opening.window) : (v.opening[type as keyof typeof v.opening] ?? type);
  if (kind === 'wall') return v.wall[type as keyof typeof v.wall] ?? type;
  const element: Record<string, () => string> = { stair: m.gallery_stair, pond: m.gallery_pond, drain: m.gallery_drain };
  return element[type]?.() ?? type;
}

export function Look({ lib, look }: { lib: LookLibrary; look: LibraryLook }) {
  const usual = lookSizeOf(look);
  const [values, setValues] = useState<Record<string, ParamValue>>({});
  const [size, setSize] = useState(usual);
  const group = lookGroup(look),
    groupName = group && groupNames(lib, group);
  const params = look.params ?? {};
  const set = (name: string, v: ParamValue) =>
    setValues(({ [name]: _old, ...rest }) => (v === null && params[name]?.default !== null ? rest : { ...rest, [name]: v }));
  const changed = Object.keys(values).length > 0 || size !== usual;
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{uiName(look.name)}</h1>
        <p className="text-sm text-muted-foreground">
          {[
            groupName && uiName(groupName),
            m.look_page_for({ targets: look.for.map(t => targetName(lib, look, t)).join(m.looks_target_separator()) }),
            `v${look.version}`,
            sizeText(usual),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <LookImage lib={lib} look={look} size={size} params={values} live />
        </div>
        <Card className="gap-3 self-start py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm">{m.look_page_controls()}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4">
            <div className="space-y-1">
              <p className="text-sm">{m.look_page_size()}</p>
              <div className="grid grid-cols-3 gap-2">
                {(['w', 'd', 'h'] as const).map(k => (
                  <Input
                    key={`${k}-${size[k]}`}
                    type="number"
                    min={1}
                    aria-label={m.look_page_size_part({ part: k === 'w' ? m.look_page_w() : k === 'd' ? m.look_page_d() : m.look_page_h() })}
                    defaultValue={size[k]}
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (v > 0 && v !== size[k]) setSize({ ...size, [k]: v });
                    }}
                    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ))}
              </div>
            </div>
            {Object.keys(params).length ? (
              <ParamControls params={params} values={values} onChange={set} recipe={{ materials: lib.materials }} />
            ) : (
              <p className="text-sm text-muted-foreground">{m.look_page_no_params()}</p>
            )}
            {changed && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setValues({});
                  setSize(usual);
                }}
              >
                {m.look_page_reset()}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
      <Variants lib={lib} look={look} onPick={set} />
    </>
  );
}
