/** Stored constraints with whether each is satisfied */
import { derived } from '@plinth/core';
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import { constraintLabel } from './common';

export function ConstraintsList() {
  const project = useEditor(s => s.project);
  const canEdit = useEditor(s => s.canEdit());
  const call = useEditor(s => s.call);
  const focus = useEditor(s => s.focus);
  const status = useMemo(() => new Map(derived(project).constraints.map(c => [c.id, c])), [project]);
  if (!project.constraints.length) return null;
  return (
    <>
      <Separator />
      <div>
        <p className="mb-2 font-medium">{m.panels_constraints_title()}</p>
        <p className="mb-2 text-xs text-muted-foreground">{m.panels_constraints_hint()}</p>
        <ItemGroup className="gap-1">
          {project.constraints.map(c => {
            const st = status.get(c.id);
            return (
              <Item key={c.id} size="xs" variant="outline">
                {!st?.ok && (
                  <ItemMedia variant="icon">
                    <TriangleAlertIcon className="text-chart-1" />
                  </ItemMedia>
                )}
                <ItemContent className="cursor-pointer" onClick={() => focus(c.targets)}>
                  <ItemTitle>{c.note ?? st?.message ?? constraintLabel(c.type)}</ItemTitle>
                  <ItemDescription>
                    {constraintLabel(c.type)}
                    {c.hard ? m.panels_constraint_hard() : ''}
                    {st?.ok ? '' : m.panels_constraint_unmet()}
                  </ItemDescription>
                </ItemContent>
                {canEdit && (
                  <ItemActions>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={m.panels_constraint_remove()}
                      onClick={() => call('constraint_remove', { constraint: c.id })}
                    >
                      <Trash2Icon />
                    </Button>
                  </ItemActions>
                )}
              </Item>
            );
          })}
        </ItemGroup>
      </div>
    </>
  );
}
