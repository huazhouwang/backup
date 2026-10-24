import { DEFAULT_LIBRARY_ID, elementTarget, findObject, furnitureTarget, looksFor, openingTarget, wallTarget } from '@plinth/core';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m } from '@/lib/i18n';
import { useEditor } from '../../store';
import { Row, useRun } from '../common';
import { FOLLOW } from './shared';

/**
 * The object's look, when the design has looks that fit it: the look of its type (like the font of the whole text), or its own
 * one; and making its own look the one for its whole type
 */
export function LookPicker({ id }: { id: string }) {
  const project = useEditor(s => s.project);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const e = findObject(project, id);
  if (!e || (e.kind !== 'furniture' && e.kind !== 'opening' && e.kind !== 'element' && e.kind !== 'wall')) return null;
  const target =
    e.kind === 'furniture'
      ? furnitureTarget(e.obj)
      : e.kind === 'opening'
        ? openingTarget(e.obj)
        : e.kind === 'element'
          ? elementTarget(e.obj)
          : wallTarget(e.obj);
  const options = looksFor(project, target);
  if (!options.length) return null;
  const looks = project.library.looks ?? {};
  const own = e.obj.look && looks[e.obj.look] ? e.obj.look : null;
  const typeLook = project.library.use?.[target];
  const typeName = typeLook && looks[typeLook] ? looks[typeLook].name : m.panels_look_default();
  const label = (v: string) => (v === FOLLOW ? m.panels_look_follow({ name: typeName }) : (looks[v]?.name ?? v));
  const value = own ?? FOLLOW;
  if (!canEdit) return <Row k={m.panels_look()} v={label(value)} />;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{m.panels_look()}</p>
      <Select value={value} onValueChange={v => run('look_set', { object: id, look: v === FOLLOW ? null : v })}>
        <SelectTrigger className="w-full" aria-label={m.panels_look()}>
          <SelectValue>{label(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW}>{label(FOLLOW)}</SelectItem>
          {options.map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap gap-x-3">
        {own && own !== typeLook && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => run('look_use', { target, look: own })}>
            {m.panels_look_use_all({ name: looks[own].name })}
          </Button>
        )}
        {!own && typeLook && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => run('look_use', { target, look: null })}>
            {m.panels_look_reset_all()}
          </Button>
        )}
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0"
          nativeButton={false}
          render={<Link to="/looks/$libraryId" params={{ libraryId: DEFAULT_LIBRARY_ID }} />}
        >
          {m.panels_look_gallery()}
        </Button>
      </div>
    </div>
  );
}
