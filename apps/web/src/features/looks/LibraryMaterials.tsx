import { type LookLibrary } from '@plinth/core';
import { MaterialSwatch } from '@/features/looks/LookCard';
import { m } from '@/lib/i18n';

/** The library's materials, like a font's glyph table */
export function Materials({ lib }: { lib: LookLibrary }) {
  const materials = Object.entries(lib.materials ?? {});
  return (
    <section id="materials" aria-labelledby="materials-title" className="scroll-mt-16 space-y-3 md:scroll-mt-4">
      <h2 id="materials-title" className="text-base font-medium">
        {m.libraries_materials()} <span className="text-sm font-normal text-muted-foreground">{m.libraries_materials_count({ count: materials.length })}</span>
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {materials.map(([id, mat]) => (
          <li key={id}>
            <MaterialSwatch id={id} material={mat} />
          </li>
        ))}
      </ul>
    </section>
  );
}
