/**
 * The design's own looks (beyond the default set): where each came from, saving one to a look library, copying looks from a
 * library, and bringing a copied look up to its library's newer version (shown before and after; never automatic).
 */
import { compareVersions, designLookOf, libraryLookOf, names, targetSize, type Look, type Project } from '@plinth/core';
import { useQuery } from '@tanstack/react-query';
import { LibraryIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LookStill } from '@/features/looks/LookStill';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m } from '@/lib/i18n';
import { getLibrary, listLibraries, lookVersions, saveToLibrary } from '@/lib/libraries';
import { useEditor } from '../store';
import { useRun } from './common';
import { ImportDialog } from './LookImportDialog';

/** What a look is for, in words: "Dining table", "Window"… */
function targetLabel(p: Project, target: string) {
  const [kind, type] = target.split(':');
  if (kind === 'furniture') return p.library.furniture[type]?.name ?? type;
  if (kind === 'opening')
    return type === 'glass-block'
      ? names(p).glassBlock(names(p).opening.window)
      : (names(p).opening[type as keyof ReturnType<typeof names>['opening']] ?? type);
  if (kind === 'wall') return names(p).wall[type as keyof ReturnType<typeof names>['wall']] ?? type;
  return p.library.elements[type]?.name ?? type;
}

export function LooksPanel() {
  const project = useEditor(s => s.project);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const looks = Object.entries(project.library.looks ?? {});
  const libs = useQuery({ queryKey: ['libraries'], queryFn: listLibraries, enabled: canEdit });
  const refs = looks.flatMap(([, l]) => (l.source ? [{ library: l.source.library, look: l.source.look }] : []));
  const versions = useQuery({ queryKey: ['look-versions', refs], queryFn: () => lookVersions(refs), enabled: refs.length > 0 });
  const [update, setUpdate] = useState<{ id: string; look: Look; next: ReturnType<typeof designLookOf> } | null>(null);

  const save = async (id: string, look: Look, library: string) => {
    try {
      const same = look.source?.library === library ? look.source.look : undefined;
      const r = await saveToLibrary(library, libraryLookOf(project, look), same);
      await run('look_import', { name: look.name, for: look.for, recipe: look.recipe, source: { library, look: r.look, version: r.version }, replace: id });
      toast.success(m.looks_saved({ name: look.name }));
      void libs.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const openUpdate = async (id: string, look: Look) => {
    const lib = await getLibrary(look.source!.library).catch(() => null);
    if (lib?.library.looks[look.source!.look]) setUpdate({ id, look, next: designLookOf(lib.library, look.source!.look, project.language) });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{m.looks_title()}</p>
        {canEdit && <ImportDialog />}
      </div>
      {looks.length === 0 ? (
        <p className="text-muted-foreground">{m.looks_empty()}</p>
      ) : (
        <ItemGroup className="gap-1">
          {looks.map(([id, look]) => {
            const latest = look.source && versions.data?.find(v => v.library === look.source!.library && v.look === look.source!.look);
            const newer = latest && compareVersions(latest.version, look.source!.version) > 0;
            return (
              <Item key={id} size="xs" variant="outline">
                <ItemContent>
                  <ItemTitle>{look.name}</ItemTitle>
                  <ItemDescription>
                    {look.for.map(t => targetLabel(project, t)).join(m.looks_target_separator())}
                    {latest && ` · ${m.looks_from({ library: latest.library_name, version: look.source!.version })}`}
                  </ItemDescription>
                  {newer && <Badge variant="secondary">{m.looks_newer({ version: latest.version })}</Badge>}
                </ItemContent>
                {canEdit && (
                  <ItemActions className="flex-wrap">
                    {newer && (
                      <Button size="xs" variant="outline" onClick={() => void openUpdate(id, look)}>
                        <RefreshCwIcon /> {m.looks_update()}
                      </Button>
                    )}
                    {!!libs.data?.some(l => l.role !== 'viewer') && (
                      <Select value="" onValueChange={v => v && void save(id, look, v as string)}>
                        <SelectTrigger size="sm" className="h-6 gap-1 text-xs" aria-label={m.looks_save_to({ name: look.name })}>
                          <LibraryIcon className="size-3" />
                          <SelectValue>{m.looks_save()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {libs.data
                            .filter(l => l.role !== 'viewer')
                            .map(l => (
                              <SelectItem key={l.id} value={l.id}>
                                {l.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={m.looks_remove({ name: look.name })}
                      onClick={() => void run('look_remove', { look: id })}
                    >
                      <Trash2Icon />
                    </Button>
                  </ItemActions>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <AlertDialog open={!!update} onOpenChange={o => !o && setUpdate(null)}>
        {update && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{m.looks_update_title({ name: update.look.name, version: update.next.source.version })}</AlertDialogTitle>
              <AlertDialogDescription>{m.looks_update_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{m.looks_before()}</p>
              <LookStill recipe={update.look.recipe} size={targetSize(project, update.look.for[0])} alt={m.looks_before()} />
              <p className="text-muted-foreground">{m.looks_after()}</p>
              <LookStill
                recipe={update.next.recipe}
                size={update.next.types ? Object.values(update.next.types)[0].size : targetSize(project, update.next.for[0])}
                alt={m.looks_after()}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.settings_cancel()}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run('look_import', { ...update.next, replace: update.id })}>{m.looks_update_confirm()}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
