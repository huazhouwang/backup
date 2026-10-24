import { lookSizeOf, type LibraryLook, type LookLibrary, type ParamValue } from '@plinth/core';
import { sizeText, LookImage } from '@/features/looks/LookCard';
import { paramText, paramTitle } from '@/features/looks/ParamControls';
import { Button } from '@/components/ui/button';
import { m } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { paramVariants, sizeVariants } from '@/features/looks/variants';
import type { VariantRole } from '@/features/looks/variants';

const roleText: Record<VariantRole | 'narrow' | 'wide', () => string> = {
  min: m.look_variant_min,
  max: m.look_variant_max,
  default: m.look_variant_default,
  auto: m.look_variant_auto,
  value: () => '',
  narrow: m.look_variant_narrow,
  wide: m.look_variant_wide,
};

/** The variant wall: a row per parameter that has values to show, and the size */
export function Variants({ lib, look, onPick }: { lib: LookLibrary; look: LibraryLook; onPick: (name: string, v: ParamValue) => void }) {
  const usual = lookSizeOf(look);
  const rows = Object.entries(look.params ?? {})
    .map(([name, d]) => ({ name, d, variants: paramVariants(d) }))
    .filter(r => r.variants.length > 1);
  return (
    <section aria-labelledby="variants-title" className="space-y-4">
      <div>
        <h2 id="variants-title" className="text-base font-medium">
          {m.look_page_variants()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.look_page_variants_hint()}</p>
      </div>
      {rows.map(({ name, d, variants }) => (
        <div key={name} className="space-y-2" data-variants={name}>
          <p className="text-sm font-medium">{paramTitle(name, d)}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {variants.map(({ value, role }) => (
              <li key={JSON.stringify(value)}>
                <Variant
                  label={paramText(d, value, { materials: lib.materials })}
                  caption={roleText[role]()}
                  current={role === 'default' || (role === 'auto' && d.default === null)}
                  onClick={() => onPick(name, value)}
                >
                  <LookImage lib={lib} look={look} params={{ [name]: value }} />
                </Variant>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="space-y-2" data-variants="size">
        <p className="text-sm font-medium">{m.look_page_size()}</p>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {sizeVariants(usual).map(({ size, role }) => (
            <li key={role}>
              <Variant label={sizeText(size)} caption={roleText[role]()} current={role === 'default'}>
                <LookImage lib={lib} look={look} size={size} />
              </Variant>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Variant({
  label,
  caption,
  current,
  onClick,
  children,
}: {
  label: string;
  caption: string;
  current?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const body = (
    <>
      {children}
      <p className="mt-1 truncate text-left text-xs">
        {label}
        {caption && <span className="text-muted-foreground"> · {caption}</span>}
      </p>
    </>
  );
  return onClick ? (
    <Button variant="ghost" className={cn('block h-auto w-full p-1 font-normal', current && 'bg-muted')} onClick={onClick} aria-pressed={current}>
      {body}
    </Button>
  ) : (
    <div className={cn('p-1', current && 'rounded-md bg-muted')}>{body}</div>
  );
}
