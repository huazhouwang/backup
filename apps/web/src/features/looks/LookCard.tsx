/**
 * Pieces of a library's page, the same for every library: a look's card (a still from the fixed direction at its type's size
 * with its default parameters, fitted to the frame, with its size and parameters written under it) and a material's swatch
 */
import { libraryRecipe, lookSizeOf, type LibraryLook, type LookLibrary, type Material } from '@plinth/core';
import { Link } from '@tanstack/react-router';
import { BoxIcon } from 'lucide-react';
import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { materialPattern } from '@/graphics/plan/floor-materials';
import { useBuild } from '@/graphics/three/looks';
import { m, uiName } from '@/lib/i18n';
import { materialStyle } from '@/lib/materials';
import { cn } from '@/lib/utils';
import { paramTitle } from './ParamControls';
import { LookStill } from './LookStill';
import { LookViewer } from './LookViewer';

/** "2100 × 900 × 800 mm" */
export const sizeText = (s: { w: number; d: number; h: number }) => `${s.w} × ${s.d} × ${s.h} mm`;

/**
 * A look drawn at a size with parameter values: a still, or `live` in 3D to turn around; a look that builds nothing (a door that
 * stays an opening) shows a placeholder instead of an empty frame. `bleed`: no frame of its own, to fill a card to its edges.
 */
export function LookImage({
  lib,
  look,
  size,
  params,
  live,
  bleed,
}: {
  lib: LookLibrary;
  look: LibraryLook;
  size?: { w: number; d: number; h: number };
  params?: Record<string, unknown>;
  live?: boolean;
  bleed?: boolean;
}) {
  const recipe = libraryRecipe(lib, look),
    at = size ?? lookSizeOf(look);
  const built = useBuild(recipe, at, params);
  if (built && !built.parts.length) {
    return (
      <div className={cn('flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground', !bleed && 'rounded-md border')}>
        <BoxIcon className="size-6" />
        {m.libraries_no_model()}
      </div>
    );
  }
  if (!built) return <Skeleton className={cn('aspect-[4/3] w-full', bleed && 'rounded-none')} />;
  const alt = m.libraries_look_alt({ name: uiName(look.name) });
  return live ? (
    <LookViewer recipe={recipe} size={at} params={params} alt={alt} />
  ) : (
    <LookStill single bleed={bleed} recipe={recipe} size={at} params={params} alt={alt} />
  );
}

export function LookCard({ lib, id, look }: { lib: LookLibrary; id: string; look: LibraryLook }) {
  const params = Object.entries(look.params ?? {});
  return (
    <Card className="gap-0 overflow-hidden py-0" data-look={id}>
      <Link
        to="/looks/$libraryId/$lookId"
        params={{ libraryId: lib.id, lookId: id }}
        className="block"
        aria-label={m.libraries_open_look({ name: uiName(look.name) })}
      >
        <LookImage lib={lib} look={look} bleed />
        <CardHeader className="rounded-t-none border-t px-3 pt-2 pb-1">
          <CardTitle className="truncate text-sm">{uiName(look.name)}</CardTitle>
          <CardDescription className="text-xs">{sizeText(lookSizeOf(look))}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-8 flex-wrap gap-1 px-3 pb-2">
          {params.map(([k, d]) => (
            <Badge key={k} variant="outline" className="font-normal">
              {paramTitle(k, d)}
            </Badge>
          ))}
        </CardContent>
      </Link>
    </Card>
  );
}

/** A material's swatch: its pattern when it has one (planks, tiles…), else its colour, with its name and id */
export function MaterialSwatch({ id, material }: { id: string; material: Material }) {
  const key = useId().replace(/:/g, '');
  const pattern = materialPattern(material),
    style = materialStyle(material);
  return (
    <div className="flex items-center gap-2" data-material={id}>
      <svg
        viewBox={pattern ? `0 0 ${pattern.w * 2} ${pattern.h * 2}` : '0 0 1 1'}
        preserveAspectRatio="xMidYMid slice"
        className="size-10 shrink-0 rounded-md border"
        aria-hidden
      >
        {pattern && (
          <defs>
            <pattern id={key} width={pattern.w} height={pattern.h} patternUnits="userSpaceOnUse">
              {pattern.tile}
            </pattern>
          </defs>
        )}
        <rect width="100%" height="100%" fill={pattern ? `url(#${key})` : style.color} fillOpacity={style.opacity} />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="truncate">{uiName(material.name)}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{id}</p>
      </div>
    </div>
  );
}
