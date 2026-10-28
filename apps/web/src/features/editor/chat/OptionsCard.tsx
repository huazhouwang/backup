/**
 * The houses the agent offers (house_choose, issue 188): each as a card with a 3D still, its ground-floor plan, what kind of
 * house it is in plain words, its footprint and area. Tapping one builds it, and the 3D view shows it going up.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanPreview } from '@/features/site/PlanPreview';
import { m } from '@/lib/i18n';
import type { ChoiceOption } from '../agent/interview-capabilities';
import { useEditor } from '../store';

const TYPOLOGY: Record<string, { title: () => string; description: () => string }> = {
  bar: { title: m.option_bar_title, description: m.option_bar_description },
  hall: { title: m.option_hall_title, description: m.option_hall_description },
  courtyard: { title: m.option_courtyard_title, description: m.option_courtyard_description },
};

/** A still of the option in 3D, drawn offscreen once */
function Still({ option }: { option: ChoiceOption }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import('@/graphics/three/house-still')
      .then(x => x.renderHouseStill(option.project, { width: 480, height: 300 }))
      .then(url => live && setSrc(url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [option.id]);
  return src ? (
    <img src={src} alt={m.option_still_alt()} className="aspect-[8/5] w-full rounded-md border object-cover" />
  ) : (
    <Skeleton className="aspect-[8/5] w-full" />
  );
}

export function OptionsCard() {
  const choice = useEditor(s => s.choice);
  const pick = useEditor(s => s.pickHouse);
  const [busy, setBusy] = useState(false);
  if (!choice) return null;
  const choose = async (id: string | null) => {
    setBusy(true);
    try {
      await pick(id);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mb-2 flex shrink-0 flex-col gap-2" aria-label={m.option_aria()}>
      <div className="flex items-baseline justify-between gap-2 px-3">
        <p className="text-sm font-medium">{m.option_heading()}</p>
        <Button variant="link" size="sm" className="h-auto p-0" disabled={busy} onClick={() => void choose(null)}>
          {m.chat_question_defer()}
        </Button>
      </div>
      <div className="flex snap-x gap-2 overflow-x-auto px-3 pb-1">
        {choice.map(o => {
          const t = TYPOLOGY[o.typology];
          return (
            <Card key={o.id} size="sm" className="w-64 shrink-0 snap-start">
              <CardHeader>
                <CardTitle className="text-sm">
                  {t?.title() ?? o.typology}
                  {o.mirrored && <span className="text-muted-foreground"> {m.option_mirrored()}</span>}
                </CardTitle>
                <CardDescription>{t?.description()}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Still option={o} />
                <PlanPreview project={o.project} className="h-28 w-full" />
                <p className="text-xs text-muted-foreground tabular-nums">{m.option_facts({ width: o.width, depth: o.depth, gross: o.gross })}</p>
                {o.overPlot && (
                  <p className="text-xs text-destructive tabular-nums">
                    {m.option_over_plot({ over: Math.max(o.overPlot.width, o.overPlot.depth).toFixed(1) })}
                  </p>
                )}
              </CardContent>
              <CardFooter>
                <Button size="sm" className="w-full" disabled={busy} onClick={() => void choose(o.id)}>
                  {m.option_pick()}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
