/**
 * The add palette, as SketchUp's component browser: doors and windows, and the design's furniture types by group. Picking one
 * enters place mode (the plan shows where it goes; a click puts it down). And the hint shown while placing.
 */
import type { OpeningKind } from '@plinth/core';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { m } from '@/lib/i18n';
import { kindLabel } from '../panels/common';
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

/** While placing, drawing a section, walking or looking at a section plane: what to do, and a way out */
export function ToolHint({ className }: { className?: string }) {
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const sectioning = useEditor(s => s.sectioning);
  const setSectioning = useEditor(s => s.setSectioning);
  const walking = useEditor(s => s.camera3d.walking);
  const setCamera3d = useEditor(s => s.setCamera3d);
  const section = useEditor(s => s.camera3d.section);
  const mode = useEditor(s => s.view.mode);
  const furniture = useEditor(s => s.project.library.furniture);
  let text: string | null = null;
  if (placing && mode === '2d') {
    const name = placing.kind === 'furniture' ? (furniture[placing.type]?.name ?? placing.type) : kindLabel(placing.opening);
    text = placing.kind === 'opening' ? m.add_hint_opening({ name }) : m.add_hint_furniture({ name });
  } else if (sectioning && mode === '2d') text = m.section_hint();
  else if (walking && mode === '3d') text = matchMedia('(pointer: coarse)').matches ? m.model3d_hint_walk_touch() : m.model3d_hint_walk();
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
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setPlacing(null);
            setSectioning(false);
            if (walking) setCamera3d({ walking: false });
          }}
        >
          {walking ? m.walk_leave() : m.add_cancel()}
        </Button>
      </div>
    </div>
  );
}
