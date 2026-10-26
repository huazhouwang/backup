/**
 * Saving one of the design's own widgets (one the agent wrote) into a widget library the user can edit, so it can be installed
 * in other designs and shared. The library gives it a new version when it changed.
 */
import type { WidgetDef } from '@plinth/core';
import { useQueryClient } from '@tanstack/react-query';
import { LibraryBigIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m, uiName } from '@/lib/i18n';
import { saveWidget } from '@/lib/widget-libraries';
import type { WidgetLibraryFile } from '@/shared/widgets';

export function WidgetSave({ id, def, libraries }: { id: string; def: WidgetDef; libraries: WidgetLibraryFile[] }) {
  const qc = useQueryClient();
  const writable = libraries.filter(l => l.role !== 'viewer');
  const [library, setLibrary] = useState<string | null>(null);
  const chosen = writable.find(l => l.library.id === library) ?? writable[0];
  if (!writable.length) return null;
  const save = () =>
    saveWidget(chosen.library.id, id, def)
      .then(r => {
        toast.success(m.widgets_saved({ library: uiName(chosen.library.name), version: r.version }));
        return Promise.all([
          qc.invalidateQueries({ queryKey: ['widget-library-files'] }),
          qc.invalidateQueries({ queryKey: ['widget-library', chosen.library.id] }),
        ]);
      })
      .catch((e: Error) => toast.error(e.message));
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={m.widgets_save({ name: uiName(def.name) })} />}>
        <LibraryBigIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.widgets_save({ name: uiName(def.name) })}</DialogTitle>
        </DialogHeader>
        <Select value={chosen.library.id} onValueChange={v => setLibrary(v as string)}>
          <SelectTrigger aria-label={m.widgets_save_library()}>
            <SelectValue>{uiName(chosen.library.name)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {writable.map(l => (
              <SelectItem key={l.library.id} value={l.library.id}>
                {uiName(l.library.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{m.settings_cancel()}</DialogClose>
          <DialogClose render={<Button onClick={() => void save()} />}>{m.widgets_save_confirm()}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
