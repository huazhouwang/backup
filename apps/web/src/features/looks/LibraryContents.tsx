import { groupedLooks } from '@plinth/core';
import { ShapesIcon } from 'lucide-react';
import { LookCard } from '@/features/looks/LookCard';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { m, uiName } from '@/lib/i18n';
import type { LibraryDetail } from '@/shared/looks';
import { GroupIndex } from './GroupIndex';
import { LibraryHeader } from './LibraryHeader';
import { Materials } from './LibraryMaterials';

/** Anchor of a group's section */
const anchor = (group: string | null) => `group-${group ?? 'other'}`;

export function Library({ detail }: { detail: LibraryDetail }) {
  const lib = detail.library;
  const groups = groupedLooks(lib);
  const materials = Object.entries(lib.materials ?? {});
  return (
    <>
      <LibraryHeader detail={detail} />
      {!groups.length && !materials.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShapesIcon />
            </EmptyMedia>
            <EmptyTitle>{m.libraries_empty()}</EmptyTitle>
            <EmptyDescription>{m.libraries_canvas_empty()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6 md:grid-cols-[11rem_1fr]">
          <GroupIndex
            entries={[
              ...groups.map(g => ({ href: `#${anchor(g.group)}`, name: g.names ? uiName(g.names) : m.libraries_group_other(), count: g.looks.length })),
              ...(materials.length ? [{ href: '#materials', name: m.libraries_materials(), count: materials.length }] : []),
            ]}
          />
          <div className="min-w-0 space-y-8">
            {groups.map(g => (
              <section
                key={anchor(g.group)}
                id={anchor(g.group)}
                aria-labelledby={`${anchor(g.group)}-title`}
                className="scroll-mt-16 space-y-3 md:scroll-mt-4"
              >
                <h2 id={`${anchor(g.group)}-title`} className="text-base font-medium">
                  {g.names ? uiName(g.names) : m.libraries_group_other()}{' '}
                  <span className="text-sm font-normal text-muted-foreground">{m.libraries_count({ count: g.looks.length })}</span>
                </h2>
                <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
                  {g.looks.map(([id, look]) => (
                    <li key={id}>
                      <LookCard lib={lib} id={id} look={look} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {materials.length > 0 && <Materials lib={lib} />}
          </div>
        </div>
      )}
    </>
  );
}
