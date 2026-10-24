import { derived, findObject } from '@plinth/core';
import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { m } from '@/lib/i18n';
import { useEditor } from '../../store';
import { ConstraintsList } from '../ConstraintsList';
import { LooksPanel } from '../LooksPanel';

export function LevelOverview() {
  const project = useEditor(s => s.project);
  const level = useEditor(s => s.view.level);
  const focus = useEditor(s => s.focus);
  const issues = derived(project).rules.filter(i => i.targets.some(t => findObject(project, t)?.level === level));
  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="text-muted-foreground">{m.panels_props_empty_hint()}</p>
      <ConstraintsList />
      <Separator />
      <LooksPanel />
      <Separator />
      <div>
        <p className="mb-2 font-medium">{m.panels_level_check()}</p>
        {issues.length === 0 ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <CheckIcon className="size-4" /> {m.panels_no_issues()}
          </p>
        ) : (
          <ItemGroup className="gap-1">
            {issues.map((i, k) => (
              <Item key={k} size="xs" render={<button type="button" />} onClick={() => focus(i.targets)} className="cursor-pointer text-left hover:bg-muted">
                <ItemMedia variant="icon">
                  <TriangleAlertIcon className={i.severity === 'error' ? 'text-destructive' : 'text-chart-1'} />
                </ItemMedia>
                <ItemContent>
                  <ItemDescription className="text-foreground">{i.message}</ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>
    </div>
  );
}
