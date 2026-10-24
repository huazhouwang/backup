import { useMemo } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';

/**
 * Level switcher, floating over the canvas top-left: a level is a choice within the plan / 3D view, stacked top floor first like
 * the building. In 3D the whole house is shown unless the cutaway is on (then the chosen level and the ones below it).
 */
export function LevelSwitcher({ className }: { className?: string }) {
  const levels = useEditor(s => s.project.levels);
  const level = useEditor(s => s.view.level);
  const setView = useEditor(s => s.setView);
  const stacked = useMemo(() => [...levels].sort((a, b) => b.elevation - a.elevation), [levels]);
  return (
    <ToggleGroup
      value={[level]}
      onValueChange={v => v[0] && setView({ level: v[0] as string })}
      orientation="vertical"
      variant="outline"
      size="sm"
      spacing={0}
      aria-label={m.editor_levels_aria()}
      className={className}
    >
      {stacked.map(l => (
        <ToggleGroupItem key={l.id} value={l.id}>
          {l.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
