/**
 * The offer of a newer version of an installed widget: what changed (its author's description, parameters added or gone, whether
 * it may now do more) and the choice to update; nothing changes until the user says so (widget_update).
 */
import type { widgetUpdate } from '@opensu/core';
import { ArrowUpCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { m, uiName } from '@/lib/i18n';
import { permissionLabel } from '@/features/widgets/labels';

type Update = NonNullable<ReturnType<typeof widgetUpdate>>;

export function WidgetUpdate({ name, update, canEdit, onUpdate }: { name: string; update: Update; canEdit: boolean; onUpdate: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const c = update.changes;
  const params = (keys: string[]) => keys.map(k => (update.def.params?.[k]?.title ? uiName(update.def.params[k].title) : k)).join(m.panels_list_separator());
  return (
    <>
      <Alert className="mt-1" data-widget-update={c.to}>
        <ArrowUpCircleIcon />
        <AlertDescription>{m.widgets_update_available({ version: c.to })}</AlertDescription>
        <AlertAction>
          <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
            {m.widgets_update_view()}
          </Button>
        </AlertAction>
      </Alert>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.widgets_update_title({ name, from: c.from, to: c.to })}</DialogTitle>
            <DialogDescription>{m.widgets_update_from({ library: uiName(update.library.name) })}</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {c.permissionsAdded.length > 0 && (
              <li className="text-destructive">
                {m.widgets_update_permissions({ list: c.permissionsAdded.map(permissionLabel).join(m.panels_list_separator()) })}
              </li>
            )}
            {c.paramsAdded.length > 0 && <li>{m.widgets_update_params_added({ list: params(c.paramsAdded) })}</li>}
            {c.paramsRemoved.length > 0 && <li>{m.widgets_update_params_removed({ list: c.paramsRemoved.join(m.panels_list_separator()) })}</li>}
            {c.script && <li>{m.widgets_update_script()}</li>}
            {c.description && <li className="whitespace-pre-line">{m.widgets_update_description({ text: c.description })}</li>}
          </ul>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{m.widgets_update_later()}</DialogClose>
            {canEdit && (
              <Button onClick={() => void onUpdate().then(() => setOpen(false))} data-widget-update-apply>
                {m.widgets_update_apply()}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
