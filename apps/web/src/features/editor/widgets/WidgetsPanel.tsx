/**
 * The widgets panel, opened from the ⋯ menu and floating over the canvas so handles can be dragged while it is open: the widgets
 * installed on this design (show or hide, their settings generated from their params, remove, a newer version offered), the
 * user's own widgets that show in every design ("for me", kept in their settings), and the ones the widget libraries offer to
 * add to either. Every change to the design is a capability call (widget_install / widget_configure / widget_remove /
 * widget_update), the same the agent makes.
 */
import {
  configureMyWidget,
  copyKey,
  DESIGN_WIDGETS,
  installMyWidget,
  myWidgetUpdate,
  removeMyWidget,
  resolveMyWidget,
  resolveWidget,
  updateMyWidget,
  widgetLibraries,
  widgetUpdate,
  type ParamValue,
  type WidgetCopy,
  type WidgetDef,
  type WidgetInstance,
} from '@opensu/core';
import { ChevronDownIcon, EyeIcon, EyeOffIcon, PlusIcon, Trash2Icon, UserPlusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { useMyWidgets } from './mine';
import { useWidgetOutputs } from './outputs';
import { WidgetSave } from './WidgetSave';
import { WidgetUpdate } from './WidgetUpdate';

/** A change from a widget's row: a param ([name, value], null for its default) or showing it */
type RowChange = { param?: [string, ParamValue]; visible?: boolean };

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
  const mine = useMyWidgets();
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
  const errorOf = (id: string) => outputs.find(o => o.id === id)?.error;

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
            return (
              <WidgetRow
                key={w.id}
                w={w}
                def={found?.def}
                copy={project.library.widgetCopies?.[copyKey(w.widget.library, w.widget.id)]}
                error={errorOf(w.id)}
                editable={canEdit}
                onChange={c =>
                  run(
                    'widget_configure',
                    // null brings a param back to its default (ParamControls' reset, or a field left empty where automatic is allowed)
                    c.param
                      ? c.param[1] === null
                        ? { widget: w.id, reset: [c.param[0]] }
                        : { widget: w.id, params: { [c.param[0]]: c.param[1] } }
                      : { widget: w.id, visible: c.visible },
                  )
                }
                onRemove={() => run('widget_remove', { widget: w.id })}
                update={widgetUpdate(project, w)}
                onUpdate={() => run('widget_update', { widget: w.id })}
                actions={w.widget.library === DESIGN_WIDGETS && found && <WidgetSave id={w.widget.id} def={found.def} libraries={files.data ?? []} />}
              />
            );
          })}
        </ItemGroup>
        {mine.ready && mine.set.widgets.length > 0 && (
          <>
            <Separator />
            <p className="text-xs text-muted-foreground">{m.widgets_mine()}</p>
            <ItemGroup data-my-widgets>
              {mine.set.widgets.map(w => (
                <WidgetRow
                  key={w.id}
                  w={w}
                  def={resolveMyWidget(mine.set, w.widget.library, w.widget.id)?.def}
                  copy={mine.set.copies?.[copyKey(w.widget.library, w.widget.id)]}
                  error={errorOf(w.id)}
                  // The user's own: theirs to change in any design, even one they may only view
                  editable
                  onChange={c =>
                    mine.change(set =>
                      configureMyWidget(
                        set,
                        w.id,
                        c.param ? (c.param[1] === null ? { reset: [c.param[0]] } : { params: { [c.param[0]]: c.param[1] } }) : { visible: c.visible },
                      ),
                    )
                  }
                  onRemove={() => mine.change(set => removeMyWidget(set, w.id))}
                  update={myWidgetUpdate(mine.set, w)}
                  onUpdate={() => mine.change(set => updateMyWidget(set, w.id))}
                />
              ))}
            </ItemGroup>
          </>
        )}
        {available.length > 0 && (canEdit || mine.ready) && (
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
                    {mine.ready && a.library !== DESIGN_WIDGETS && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void mine.change(set => installMyWidget(set, a.library, a.id, project.language))}
                        aria-label={m.widgets_add_mine({ name: uiName(a.def.name) })}
                        title={m.widgets_add_mine({ name: uiName(a.def.name) })}
                      >
                        <UserPlusIcon />
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        onClick={() => void run('widget_install', { library: a.library, widget: a.id })}
                        aria-label={m.widgets_add({ name: uiName(a.def.name) })}
                      >
                        <PlusIcon />
                      </Button>
                    )}
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

/** One installed widget: show or hide, settings, remove, where it comes from, a newer version, why it draws nothing */
function WidgetRow({
  w,
  def,
  copy,
  error,
  editable,
  onChange,
  onRemove,
  update,
  onUpdate,
  actions,
}: {
  w: WidgetInstance;
  def: WidgetDef | undefined;
  copy: WidgetCopy | undefined;
  error: string | undefined;
  editable: boolean;
  onChange: (change: RowChange) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
  update: Parameters<typeof WidgetUpdate>[0]['update'] | undefined;
  onUpdate: () => Promise<unknown>;
  actions?: ReactNode;
}) {
  return (
    <Collapsible data-widget-row={w.id}>
      <Item size="sm" variant="outline">
        <ItemContent>
          <ItemTitle>{w.name}</ItemTitle>
          {copy?.libraryName && <ItemDescription>{m.libraries_owner({ name: uiName(copy.libraryName) })}</ItemDescription>}
        </ItemContent>
        <ItemActions>
          {actions}
          <Toggle
            size="sm"
            pressed={w.visible}
            disabled={!editable}
            onPressedChange={visible => void onChange({ visible })}
            aria-label={m.widgets_visible({ name: w.name })}
          >
            {w.visible ? <EyeIcon /> : <EyeOffIcon />}
          </Toggle>
          {def?.params && (
            <CollapsibleTrigger render={<Button variant="ghost" size="icon-sm" aria-label={m.widgets_settings({ name: w.name })} />}>
              <ChevronDownIcon />
            </CollapsibleTrigger>
          )}
          {editable && (
            <Button variant="ghost" size="icon-sm" onClick={() => void onRemove()} aria-label={m.widgets_remove({ name: w.name })}>
              <Trash2Icon />
            </Button>
          )}
        </ItemActions>
      </Item>
      {!def && (
        <Alert className="mt-1">
          <AlertDescription>{m.widgets_unknown()}</AlertDescription>
        </Alert>
      )}
      {update && <WidgetUpdate name={w.name} update={update} canEdit={editable} onUpdate={onUpdate} />}
      {def && error && (
        <Alert variant="destructive" className="mt-1">
          <AlertDescription>{m.widgets_error({ message: error })}</AlertDescription>
        </Alert>
      )}
      {def?.params && (
        <CollapsibleContent className="space-y-2 px-1 pt-2">
          <ParamControls params={def.params} values={w.params} onChange={(name, value) => void onChange({ param: [name, value] })} readOnly={!editable} />
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
