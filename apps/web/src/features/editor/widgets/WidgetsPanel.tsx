/**
 * The widgets panel, opened from the ⋯ menu and floating over the canvas so handles can be dragged while it is open: the widgets
 * installed on this design (show or hide, their settings generated from their params, remove) and the ones the widget libraries
 * offer to add. Every change is a capability call (widget_install / widget_configure / widget_remove), the same the agent makes.
 */
import { copyKey, DESIGN_WIDGETS, resolveWidget, widgetLibraries, widgetUpdate, type ParamValue } from '@plinth/core';
import { ChevronDownIcon, EyeIcon, EyeOffIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { cn } from 'cn';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';
import { m, uiName } from '@/lib/i18n';
import { ParamControls } from '@/features/looks/ParamControls';
import { useRun } from '../panels/common';
import { useEditor } from '../store';
import { useWidgetLibraries } from './libraries';
import { useWidgetOutputs } from './outputs';
import { WidgetSave } from './WidgetSave';
import { WidgetUpdate } from './WidgetUpdate';

export function WidgetsPanel({ className }: { className?: string }) {
  const open = useEditor(s => s.widgetsOpen);
  const setOpen = useEditor(s => s.setWidgetsOpen);
  const project = useEditor(s => s.project);
  const view = useEditor(s => s.view);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  // The same run the canvas makes (cached), for any error to show
  const outputs = useWidgetOutputs(project, view.level, view.mode === '3d' ? '3d' : 'plan');
  // Mounted with the editor (closed or not), so the user's libraries are known to the agent too
  const files = useWidgetLibraries();
  if (!open) return null;

  const available = [
    ...widgetLibraries().flatMap(({ origin, library }) =>
      Object.entries(library.widgets).map(([id, def]) => ({
        library: library.id,
        id,
        def,
        from: origin.origin === 'builtin' ? undefined : uiName(library.name),
      })),
    ),
    // The design's own (written by the agent), when not on the canvas
    ...Object.keys(project.library.widgets ?? {}).flatMap(id => {
      const found = resolveWidget(project, DESIGN_WIDGETS, id);
      const installed = project.widgets.some(w => w.widget.library === DESIGN_WIDGETS && w.widget.id === id);
      return found && !installed ? [{ library: DESIGN_WIDGETS, id, def: found.def, from: m.widgets_from_design() }] : [];
    }),
  ];
  const setParam = (widget: string, name: string, value: ParamValue) =>
    // null brings a param back to its default (ParamControls' reset, or a field left empty where automatic is allowed)
    run('widget_configure', value === null ? { widget, reset: [name] } : { widget, params: { [name]: value } });

  return (
    <Card size="sm" className={cn('w-72 max-w-[calc(100vw-1rem)] gap-2 shadow-md', className)} data-widgets-panel>
      <CardHeader>
        <CardTitle>{m.widgets_title()}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label={m.widgets_close()}>
            <XIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto">
        {project.widgets.length === 0 && <p className="text-sm text-muted-foreground">{m.widgets_empty()}</p>}
        <ItemGroup>
          {project.widgets.map(w => {
            const found = resolveWidget(project, w.widget.library, w.widget.id);
            const error = outputs.find(o => o.id === w.id)?.error;
            const update = widgetUpdate(project, w);
            const copy = project.library.widgetCopies?.[copyKey(w.widget.library, w.widget.id)];
            return (
              <Collapsible key={w.id} data-widget-row={w.id}>
                <Item size="sm" variant="outline">
                  <ItemContent>
                    <ItemTitle>{w.name}</ItemTitle>
                    {copy?.libraryName && <ItemDescription>{m.libraries_owner({ name: uiName(copy.libraryName) })}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    {w.widget.library === DESIGN_WIDGETS && found && <WidgetSave id={w.widget.id} def={found.def} libraries={files.data ?? []} />}
                    <Toggle
                      size="sm"
                      pressed={w.visible}
                      disabled={!canEdit}
                      onPressedChange={visible => void run('widget_configure', { widget: w.id, visible })}
                      aria-label={m.widgets_visible({ name: w.name })}
                    >
                      {w.visible ? <EyeIcon /> : <EyeOffIcon />}
                    </Toggle>
                    {found?.def.params && (
                      <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" aria-label={m.widgets_settings({ name: w.name })} />}>
                        <ChevronDownIcon />
                      </CollapsibleTrigger>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void run('widget_remove', { widget: w.id })}
                        aria-label={m.widgets_remove({ name: w.name })}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </ItemActions>
                </Item>
                {!found && (
                  <Alert className="mt-1">
                    <AlertDescription>{m.widgets_unknown()}</AlertDescription>
                  </Alert>
                )}
                {update && <WidgetUpdate name={w.name} update={update} canEdit={canEdit} onUpdate={() => run('widget_update', { widget: w.id })} />}
                {found && error && (
                  <Alert variant="destructive" className="mt-1">
                    <AlertDescription>{m.widgets_error({ message: error })}</AlertDescription>
                  </Alert>
                )}
                {found?.def.params && (
                  <CollapsibleContent className="space-y-2 px-1 pt-2">
                    <ParamControls
                      params={found.def.params}
                      values={w.params}
                      onChange={(name, value) => void setParam(w.id, name, value)}
                      readOnly={!canEdit}
                    />
                  </CollapsibleContent>
                )}
              </Collapsible>
            );
          })}
        </ItemGroup>
        {canEdit && available.length > 0 && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">{m.widgets_available()}</p>
            <ItemGroup>
              {available.map(a => (
                <Item key={`${a.library}/${a.id}`} size="sm">
                  <ItemContent>
                    <ItemTitle>{uiName(a.def.name)}</ItemTitle>
                    {a.from && <ItemDescription>{a.from}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => void run('widget_install', { library: a.library, widget: a.id })}
                      aria-label={m.widgets_add({ name: uiName(a.def.name) })}
                    >
                      <PlusIcon />
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </>
        )}
      </CardContent>
    </Card>
  );
}
