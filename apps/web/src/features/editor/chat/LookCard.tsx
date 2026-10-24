/**
 * The look just added or changed: a still from three sides, and what to do with it: use it (for every object of its type when
 * nothing uses it yet), or discard it (a new look is removed, a change is undone). Asking for changes is just chatting on.
 */
import { targetSize } from '@plinth/core';
import { CheckIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { m } from '@/lib/i18n';
import { renderLookPreview } from '@/graphics/three/look-preview';
import { useEditor } from '../store';
import { useRun } from '../panels/common';

export function LookCard() {
  const change = useEditor(s => s.lookChange);
  const project = useEditor(s => s.project);
  const clear = useEditor(s => s.clearLookChange);
  const undo = useEditor(s => s.undo);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const look = change ? project.library.looks?.[change.id] : undefined;
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    setImage(null);
    if (!look) return;
    let live = true;
    renderLookPreview(look.recipe, targetSize(project, look.for[0]), { width: 720, height: 240 })
      .then(url => live && setImage(url))
      .catch(() => {});
    return () => void (live = false);
  }, [look?.recipe, look?.for[0]]);
  if (!change || !look || !canEdit) return null;
  const used =
    Object.values(project.library.use ?? {}).includes(change.id) ||
    [...project.furniture, ...project.elements, ...project.walls.flatMap(w => w.openings)].some(o => o.look === change.id);
  const use = async () => {
    if (!used)
      await run('batch', {
        label: m.chat_look_use_all_label({ name: look.name }),
        calls: look.for.map(target => ({ name: 'look_use', input: { target, look: change.id } })),
      });
    clear();
  };
  const discard = async () => {
    if (change.isNew) await run('look_remove', { look: change.id });
    else undo();
    clear();
  };
  return (
    <Card size="sm" className="mx-3 mb-2 gap-2 px-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{change.isNew ? m.chat_look_new({ name: look.name }) : m.chat_look_changed({ name: look.name })}</span>
      </div>
      {image ? (
        <img src={image} alt={m.chat_look_preview_alt({ name: look.name })} className="w-full rounded-md border" />
      ) : (
        <Skeleton className="aspect-[3/1] w-full" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={use}>
          <CheckIcon /> {used ? m.chat_look_keep() : m.chat_look_use_all()}
        </Button>
        <Button size="sm" variant="outline" onClick={discard}>
          <Trash2Icon /> {change.isNew ? m.chat_look_discard() : m.chat_look_revert()}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{m.chat_look_hint()}</p>
    </Card>
  );
}
