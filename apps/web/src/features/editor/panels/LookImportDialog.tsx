import { designLookOf, lookSizeOf, type LookLibrary } from '@plinth/core';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { LookStill } from '@/features/looks/LookStill';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m, uiName } from '@/lib/i18n';
import { getLibrary, listLibraries } from '@/lib/libraries';
import { useEditor } from '../store';
import { useRun } from './common';

/** Copy a look from a library into the design, used for every object it fits */
export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const all = useQuery({ queryKey: ['libraries'], queryFn: listLibraries, enabled: open });
  // The default library is what the design already falls back to; to go back to it, reset a look instead
  const libs = { ...all, data: all.data?.filter(l => !l.default) };
  const [picked, setPicked] = useState<string | null>(null);
  // The user's own and shared libraries come first; built-in ones after them
  const library = picked ?? (libs.data?.find(l => !l.builtin) ?? libs.data?.[0])?.id ?? null;
  const detail = useQuery({ queryKey: ['library', library], queryFn: () => getLibrary(library!), enabled: open && !!library });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline" />}>
        <PlusIcon /> {m.looks_import()}
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{m.looks_import_title()}</DialogTitle>
          <DialogDescription>{m.looks_import_description()}</DialogDescription>
        </DialogHeader>
        {libs.data && !libs.data.length && <p className="text-sm text-muted-foreground">{m.looks_no_libraries()}</p>}
        {!!libs.data?.length && (
          <Select value={library ?? ''} onValueChange={v => setPicked(v as string)}>
            <SelectTrigger className="w-full sm:w-72" aria-label={m.looks_library()}>
              <SelectValue>{libs.data.find(l => l.id === library)?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {libs.data.map(l => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {detail.data &&
          (Object.keys(detail.data.library.looks).length ? (
            <LibraryLooks lib={detail.data.library} onImported={() => setOpen(false)} />
          ) : (
            <p className="text-sm text-muted-foreground">{m.libraries_empty()}</p>
          ))}
      </DialogContent>
    </Dialog>
  );
}

/** A library's looks to copy into the design, each used for every object it fits */
export function LibraryLooks({ lib, onImported }: { lib: LookLibrary; onImported: () => void }) {
  const project = useEditor(s => s.project);
  const run = useRun();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(lib.looks).map(([id, look]) => {
        const k = designLookOf(lib, id, project.language);
        return (
          <div key={id} className="space-y-1">
            <LookStill recipe={k.recipe} size={lookSizeOf(look)} alt={m.libraries_look_alt({ name: uiName(look.name) })} />
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {uiName(look.name)} <span className="text-muted-foreground">v{look.version}</span>
              </span>
              <Button
                size="xs"
                onClick={async () => {
                  const r = await run('look_import', { ...k, use: true });
                  if (r.ok) {
                    toast.success(m.looks_imported({ name: k.name }));
                    onImported();
                  }
                }}
              >
                {m.looks_import_use()}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
