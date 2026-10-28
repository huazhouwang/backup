/**
 * A design's style renders (issue 195), newest style first, each style's shots in a grid. An image opens large, over the 3D view
 * it was made from (before/after), with its shot and style; editors can delete it.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { api } from '@/lib/api';
import { m } from '@/lib/i18n';
import { renderImageUrl, type RenderInfo } from '@/shared/renders';
import { BeforeAfter } from './BeforeAfter';

/** Renders grouped by style, in the order the styles were last made */
export function byStyle(renders: RenderInfo[]) {
  const groups = new Map<string, RenderInfo[]>();
  for (const r of renders) {
    const key = `${r.style}:${r.style_name}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map(list => ({ name: list[0].style_name, renders: list.toReversed() }));
}

export function RenderGallery({ projectId, renders, editable }: { projectId: string; renders: RenderInfo[]; editable: boolean }) {
  const [open, setOpen] = useState<RenderInfo | null>(null);
  const qc = useQueryClient();
  if (!renders.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{m.render_empty_title()}</EmptyTitle>
          <EmptyDescription>{m.render_empty_description()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  const remove = async (r: RenderInfo) => {
    await api(`/projects/${projectId}/renders/${r.id}`, { method: 'DELETE' });
    setOpen(null);
    await qc.invalidateQueries({ queryKey: ['renders', projectId] });
  };
  return (
    <section className="flex flex-col gap-4" aria-label={m.render_gallery_aria()}>
      {byStyle(renders).map(g => (
        <div key={g.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{g.name}</h3>
          <div className="grid grid-cols-2 gap-2">
            {g.renders.map(r => (
              <Button key={r.id} variant="ghost" className="h-auto flex-col items-stretch gap-1 p-0" onClick={() => setOpen(r)}>
                <img
                  src={renderImageUrl(r.id)}
                  alt={m.render_alt({ style: r.style_name, shot: r.shot_name })}
                  className="aspect-[4/3] w-full rounded-md border object-cover"
                  loading="lazy"
                />
                <span className="truncate text-xs font-normal text-muted-foreground">{r.shot_name}</span>
              </Button>
            ))}
          </div>
        </div>
      ))}
      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.style_name}</DialogTitle>
                <DialogDescription>{m.render_dialog_description({ shot: open.shot_name })}</DialogDescription>
              </DialogHeader>
              <BeforeAfter
                before={renderImageUrl(open.id, 'source')}
                after={renderImageUrl(open.id)}
                alt={m.render_alt({ style: open.style_name, shot: open.shot_name })}
              />
              <DialogFooter>
                <Button variant="outline" nativeButton={false} render={<a href={renderImageUrl(open.id)} download={`${open.style_name}-${open.shot_name}`} />}>
                  {m.render_download()}
                </Button>
                {editable && (
                  <Button variant="destructive" onClick={() => void remove(open)}>
                    {m.render_delete()}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
