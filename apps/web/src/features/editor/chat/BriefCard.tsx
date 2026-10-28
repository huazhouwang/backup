/**
 * The brief as the interview fills it in (issue 186): storeys, the rooms with their target areas, and the styles picked. The owner
 * corrects it here directly; every change goes through brief_update like any other edit (and is undoable).
 */
import { DEFAULT_AREA, normalizeProgram, ROOM_TYPES, roomTypeName, type HouseProgram, type RoomType } from '@opensu/core';
import { PlusIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { m } from '@/lib/i18n';
import { useEditor, useEditorStore } from '../store';

const FLOORS = [1, 2, 3];

/** Style keys the agent records (brief.style), as the owner reads them; an unknown key shows as it is */
const STYLES: Record<string, () => string> = {
  modern: m.style_modern,
  chinese: m.style_chinese,
  japanese: m.style_japanese,
  nordic: m.style_nordic,
  french: m.style_french,
  american: m.style_american,
  mediterranean: m.style_mediterranean,
  industrial: m.style_industrial,
};
const styleName = (key: string) => STYLES[key]?.() ?? key;

export function BriefCard({ editable }: { editable: boolean }) {
  const store = useEditorStore();
  const brief = useEditor(s => s.project.brief);
  const language = useEditor(s => s.project.language);
  const program = brief.program;
  if (!program) return null;
  // What will be built: the program as completed (default areas, a bathroom per storey…)
  const planned = normalizeProgram(program, language);
  const update = (next: HouseProgram) => void store.getState().call('brief_update', { program: next });
  const remove = (i: number) => update({ ...program, rooms: program.rooms.filter((_, k) => k !== i) });
  // Rooms the house will get without being asked (a bathroom per storey with bedrooms, a living room or kitchen)
  const asked = new Map<string, number>();
  for (const r of program.rooms) asked.set(r.type, (asked.get(r.type) ?? 0) + 1);
  const added = planned.rooms
    .filter(r => {
      const left = asked.get(r.type) ?? 0;
      asked.set(r.type, left - 1);
      return left <= 0;
    })
    .map(r => r.name);
  const area = (i: number) => program.rooms[i].area ?? DEFAULT_AREA[program.rooms[i].type];
  return (
    <Card size="sm" className="shrink-0" aria-label={m.brief_card_aria()}>
      <CardHeader>
        <CardTitle className="text-sm">{m.brief_card_title()}</CardTitle>
        <CardDescription>{m.brief_card_description()}</CardDescription>
        <CardAction>
          <Select value={String(program.floors)} disabled={!editable} onValueChange={v => update({ ...program, floors: Number(v) })}>
            <SelectTrigger size="sm" className="h-7 gap-1 text-xs" aria-label={m.brief_card_floors_aria()}>
              <SelectValue>{m.brief_card_floors({ count: program.floors })}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {FLOORS.map(n => (
                <SelectItem key={n} value={String(n)}>
                  {m.brief_card_floors({ count: n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {program.rooms.map((r, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {r.name ?? roomTypeName(r.type, language)}
              <span className="text-muted-foreground tabular-nums">{m.brief_card_area({ area: Math.round(area(i)) })}</span>
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="-mr-1 size-4"
                  aria-label={m.brief_card_remove({ name: r.name ?? roomTypeName(r.type, language) })}
                  onClick={() => remove(i)}
                >
                  <XIcon />
                </Button>
              )}
            </Badge>
          ))}
          {editable && (
            <Select value="" onValueChange={v => update({ ...program, rooms: [...program.rooms, { type: v as RoomType }] })}>
              <SelectTrigger size="sm" className="h-6 gap-1 px-2 text-xs" aria-label={m.brief_card_add()}>
                <PlusIcon />
                <SelectValue placeholder={m.brief_card_add()} />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    {roomTypeName(t, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {added.length > 0 && <p className="text-xs text-muted-foreground">{m.brief_card_added({ rooms: added.join(m.list_separator()) })}</p>}
        {brief.style?.length || brief.household?.length ? (
          <p className="text-xs text-muted-foreground">{[...(brief.household ?? []), ...(brief.style ?? []).map(styleName)].join(' · ')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
