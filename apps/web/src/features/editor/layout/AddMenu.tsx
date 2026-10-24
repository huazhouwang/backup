/**
 * The add palette, as SketchUp's component browser: doors and windows, and the design's furniture types by group. Picking one
 * enters place mode (the plan shows where it goes; a click puts it down).
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

/** While placing: what to do, and a way out */
export function PlaceHint({ className }: { className?: string }) {
  const placing = useEditor(s => s.placing);
  const setPlacing = useEditor(s => s.setPlacing);
  const furniture = useEditor(s => s.project.library.furniture);
  if (!placing) return null;
  const name = placing.kind === 'furniture' ? (furniture[placing.type]?.name ?? placing.type) : kindLabel(placing.opening);
  return (
    <div className={className}>
      <div className="flex items-center gap-2 rounded-lg bg-background px-3 py-1.5 text-sm shadow-md ring-1 ring-foreground/10">
        <span>{placing.kind === 'opening' ? m.add_hint_opening({ name }) : m.add_hint_furniture({ name })}</span>
        <Button size="xs" variant="outline" onClick={() => setPlacing(null)}>
          {m.add_cancel()}
        </Button>
      </div>
    </div>
  );
}
