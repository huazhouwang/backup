/** A still of a look from three sides (see editor/model3d/look-preview.ts), drawn on demand */
import type { Recipe } from '@plinth/core';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { renderLookPreview } from '@/graphics/three/look-preview';
import { cn } from '@/lib/utils';

/**
 * `single`: only the three-quarter view, in a 4:3 image (`large` draws it at twice the resolution); `params`: values for the
 * look's parameters; `bleed`: no frame of its own, for an image that fills a card to its edges
 */
export function LookStill({
  recipe,
  size,
  alt,
  className,
  single,
  large,
  params,
  bleed,
}: {
  recipe: Recipe;
  size: { w: number; d: number; h: number };
  alt: string;
  className?: string;
  single?: boolean;
  large?: boolean;
  params?: Record<string, unknown>;
  bleed?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const key = JSON.stringify([recipe, size, single, large, params]);
  useEffect(() => {
    let live = true;
    setSrc(null);
    const px = single ? (large ? { width: 800, height: 600 } : { width: 400, height: 300 }) : { width: 480, height: 160 };
    renderLookPreview(recipe, size, { ...px, single, params })
      .then(u => live && setSrc(u))
      .catch(() => {});
    return () => void (live = false);
  }, [key]);
  const aspect = single ? 'aspect-[4/3]' : 'aspect-[3/1]';
  return src ? (
    <img src={src} alt={alt} className={cn(aspect, 'w-full object-cover', !bleed && 'rounded-md border', className)} />
  ) : (
    <Skeleton className={cn(aspect, 'w-full', bleed && 'rounded-none', className)} />
  );
}
