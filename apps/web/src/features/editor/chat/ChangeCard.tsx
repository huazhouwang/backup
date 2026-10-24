/** The last change: label, area changes, new warnings, compare with before, undo */
import { Columns2Icon, TriangleAlertIcon, Undo2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

export function ChangeCard() {
  const last = useEditor(s => s.lastChange);
  const compare = useEditor(s => s.compare);
  const setCompare = useEditor(s => s.setCompare);
  const undo = useEditor(s => s.undo);
  if (!last) return null;
  const changes = last.areaChanges.filter(c => c.before != null && c.after != null && Math.abs(c.after - c.before) >= 0.05);
  const added = last.areaChanges.filter(c => c.before == null);
  const removed = last.areaChanges.filter(c => c.after == null);
  return (
    <Card size="sm" className="mx-3 mb-2 gap-1 px-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{last.label}</span>
        <div className="flex gap-1">
          <Button size="xs" variant={compare ? 'secondary' : 'ghost'} onClick={() => setCompare(!compare)}>
            <Columns2Icon /> {compare ? m.chat_hide_before() : m.chat_compare_before()}
          </Button>
          <Button size="xs" variant="ghost" onClick={undo}>
            <Undo2Icon /> {m.chat_undo()}
          </Button>
        </div>
      </div>
      {(changes.length > 0 || added.length > 0 || removed.length > 0) && (
        <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
          {changes.map(c => (
            <li key={c.id}>
              {m.chat_area_changed({ name: c.name, before: c.before!.toFixed(1) })}
              <span className="text-foreground">{c.after!.toFixed(1)} m²</span>
              {m.chat_area_delta({ delta: `${c.after! > c.before! ? '+' : ''}${(c.after! - c.before!).toFixed(1)}` })}
            </li>
          ))}
          {added.map(c => (
            <li key={c.id}>{m.chat_area_added({ name: c.name, area: c.after!.toFixed(1) })}</li>
          ))}
          {removed.map(c => (
            <li key={c.id}>{m.chat_area_removed({ name: c.name })}</li>
          ))}
        </ul>
      )}
      {last.warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {last.warnings.map((w, i) => (
            <li key={i} className="flex gap-1">
              <TriangleAlertIcon className="size-3.5 shrink-0 text-chart-1" />
              {w.message}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
