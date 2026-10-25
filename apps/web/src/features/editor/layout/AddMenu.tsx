/**
 * The add palette, as SketchUp's component browser: doors and windows, and the design's furniture types by group. Picking one
 * enters place mode (the plan shows where it goes; a click puts it down). And the hint shown while placing or measuring, or with
 * the axes selected.
 */
import type { OpeningKind } from '@plinth/core';
import { PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';
import { kindLabel, useRun } from '../panels/common';
import { useEditor } from '../store';

const OPENINGS: OpeningKind[] = ['door', 'sliding-door', 'window', 'opening', 'gate'];

export function AddMenu() {
  const furniture = useEditor(s => s.project.library.furniture);
  const setPlacing = useEditor(s => s.setPlacing);
  const select = useEditor(s => s.select);
  const [open, setOpen] = useState(false);
  const groups = new Map<string, [string, string][]>();
  for (const [type, f] of Object.entries(furniture)) {
    const g = f.group ?? m.add_group_other();
    groups.set(g, [...(groups.get(g) ?? []), [type, f.name]]);
  }
  const pick = (p: Parameters<typeof setPlacing>[0]) => {
    select([]);
    setPlacing(p);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" className="bg-background" aria-label={m.add_title()} />}>
        <PlusIcon />
        {m.add_button()}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={m.add_search()} />
          <CommandList className="max-h-80">
            <CommandEmpty>{m.add_none()}</CommandEmpty>
            <CommandGroup heading={m.add_group_openings()}>
              {OPENINGS.map(k => (
                <CommandItem key={k} value={`opening ${kindLabel(k)}`} onSelect={() => pick({ kind: 'opening', opening: k })}>
                  {kindLabel(k)}
                </CommandItem>
              ))}
            </CommandGroup>
            {[...groups].map(([g, items]) => (
              <CommandGroup key={g} heading={g}>
                {items.map(([type, name]) => (
                  <CommandItem key={type} value={`${type} ${name} ${g}`} onSelect={() => pick({ kind: 'furniture', type })}>
                    {name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** While placing, measuring, drawing a section, walking or looking at a section plane: what to do, and a way out */
export function ToolHint({ className }: { className?: string }) {
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const measuring = useEditor(s => s.measuring);
  const setMeasuring = useEditor(s => s.setMeasuring);
  const sectioning = useEditor(s => s.sectioning);
  const setSectioning = useEditor(s => s.setSectioning);
  const walking = useEditor(s => s.camera3d.walking);
  const setCamera3d = useEditor(s => s.setCamera3d);
  const section = useEditor(s => s.camera3d.section);
  const mode = useEditor(s => s.view.mode);
  const furniture = useEditor(s => s.project.library.furniture);
  const axesEdit = useEditor(s => s.axesEdit);
  const setAxesEdit = useEditor(s => s.setAxesEdit);
  let text: string | null = null;
  if (placing && mode === '2d') {
    const name = placing.kind === 'furniture' ? (furniture[placing.type]?.name ?? placing.type) : kindLabel(placing.opening);
    text = placing.kind === 'opening' ? m.add_hint_opening({ name }) : m.add_hint_furniture({ name });
  } else if (measuring) text = mode === '2d' ? m.measure_hint_plan() : m.measure_hint_3d();
  else if (sectioning && mode === '2d') text = m.section_hint();
  else if (walking && mode === '3d') text = matchMedia('(pointer: coarse)').matches ? m.model3d_hint_walk_touch() : m.model3d_hint_walk();
  // The axes selected in the plan: their angle to type, aligning to a wall, resetting them
  if (!text && axesEdit && mode === '2d')
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm shadow-md ring-1 ring-foreground/10">
          <span>{axesEdit === 'align' ? m.axes_hint_align() : m.axes_hint()}</span>
          <AxesControls />
          <Button size="xs" variant="outline" onClick={() => setAxesEdit(null)}>
            {m.axes_done()}
          </Button>
        </div>
      </div>
    );
  // A section plane in 3D: flip it or clear it
  if (!text && section && mode === '3d')
    return (
      <div className={className}>
        <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm shadow-md ring-1 ring-foreground/10">
          <span>{m.section_on()}</span>
          <Button size="xs" variant="outline" onClick={() => setCamera3d({ section: { a: section.b, b: section.a } })}>
            {m.view_section_flip()}
          </Button>
          <Button size="xs" variant="outline" onClick={() => setCamera3d({ section: null })}>
            {m.section_clear()}
          </Button>
        </div>
      </div>
    );
  if (!text) return null;
  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm shadow-md ring-1 ring-foreground/10">
        <span>{text}</span>
        {measuring && <GuideControls />}
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setPlacing(null);
            setMeasuring(false);
            setSectioning(false);
            if (walking) setCamera3d({ walking: false });
          }}
        >
          {measuring ? m.measure_done() : walking ? m.walk_leave() : m.add_cancel()}
        </Button>
      </div>
    </div>
  );
}

/** With the tape measure: the offset of the guide just drawn, to type exactly, and clearing all the guides */
function GuideControls() {
  const edit = useEditor(s => s.guideEdit);
  const setEdit = useEditor(s => s.setGuideEdit);
  const count = useEditor(s => s.project.guides?.length ?? 0);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const [value, setValue] = useState('');
  useEffect(() => setValue(edit ? String(edit.distance) : ''), [edit]);
  if (!canEdit || (!edit && !count)) return null;
  const apply = async () => {
    const d = Number(value);
    if (!edit || !Number.isFinite(d) || d === edit.distance) return;
    const at = [Math.round(edit.origin[0] + edit.normal[0] * d), Math.round(edit.origin[1] + edit.normal[1] * d)];
    if ((await run('guide_move', { guide: edit.id, at })).ok) setEdit({ ...edit, distance: d });
  };
  return (
    <>
      {edit && (
        <label className="flex items-center gap-1 text-muted-foreground">
          {m.guide_offset()}
          <Input
            className="h-6 w-20 px-1.5 text-right"
            inputMode="numeric"
            value={value}
            aria-label={m.guide_offset()}
            onChange={e => setValue(e.target.value.replace(/[^\d-]/g, ''))}
            onKeyDown={e => e.key === 'Enter' && void apply()}
            onBlur={() => void apply()}
          />
          mm
        </label>
      )}
      {count > 0 && (
        <Button
          size="xs"
          variant="ghost"
          onClick={async () => {
            if ((await run('guide_remove', { all: true })).ok) setEdit(null);
          }}
        >
          {m.guide_clear()}
        </Button>
      )}
    </>
  );
}

/** With the axes selected: the red axis's angle to type, a tap on a wall to align it, and putting the axes back */
function AxesControls() {
  const axes = useEditor(s => s.project.axes);
  const axesEdit = useEditor(s => s.axesEdit);
  const setAxesEdit = useEditor(s => s.setAxesEdit);
  const run = useRun();
  const angle = axes?.angle ?? 0;
  const [value, setValue] = useState('');
  useEffect(() => setValue(String(angle)), [angle]);
  const apply = () => {
    const a = Number(value);
    if (value.trim() && Number.isFinite(a) && a !== angle) void run('axes_set', { angle: a });
  };
  return (
    <>
      <label className="flex items-center gap-1 text-muted-foreground">
        {m.axes_angle()}
        <Input
          className="h-6 w-16 px-1.5 text-right"
          inputMode="decimal"
          value={value}
          aria-label={m.axes_angle()}
          onChange={e => setValue(e.target.value.replace(/[^\d.-]/g, ''))}
          onKeyDown={e => e.key === 'Enter' && apply()}
          onBlur={apply}
        />
        °
      </label>
      <Button size="xs" variant={axesEdit === 'align' ? 'default' : 'outline'} onClick={() => setAxesEdit(axesEdit === 'align' ? 'handles' : 'align')}>
        {m.axes_align()}
      </Button>
      {axes && (
        <Button size="xs" variant="ghost" onClick={() => void run('axes_set', { reset: true })}>
          {m.axes_reset()}
        </Button>
      )}
    </>
  );
}
