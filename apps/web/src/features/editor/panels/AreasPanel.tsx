/** Gross area per level and usable area per space */
import { derived } from '@plinth/core';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { m } from '@/lib/i18n';
import { fmtArea } from '@/lib/query';
import { useEditor } from '../store';
import { kindLabel } from './common';

export function AreasPanel() {
  const project = useEditor(s => s.project);
  const focus = useEditor(s => s.focus);
  const report = derived(project).areas;
  return (
    <div className="space-y-4 p-4">
      <div>
        <p className="text-xs text-muted-foreground">{m.panels_total_gross()}</p>
        <p className="text-2xl font-medium">{fmtArea(report.totalGross)}</p>
      </div>
      {report.levels
        .filter(l => l.spaces.length)
        .map(l => {
          const inner = l.spaces.filter(s => s.kind === 'indoor').reduce((a, s) => a + s.net, 0);
          return (
            <div key={l.id}>
              <div className="flex items-baseline justify-between">
                <p className="font-medium">{l.name}</p>
                <p className="text-xs text-muted-foreground">{m.panels_level_summary({ gross: fmtArea(l.gross), inner: fmtArea(inner) })}</p>
              </div>
              <Table className="mt-1">
                <TableBody>
                  {l.spaces.map(s => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => focus([s.id])}>
                      <TableCell className="py-1.5">
                        {s.name}
                        {s.kind !== 'indoor' && <span className="text-muted-foreground">{m.panels_area_kind_suffix({ kind: kindLabel(s.kind) })}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono">{s.net.toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      <p className="text-xs text-muted-foreground">{m.panels_area_note()}</p>
    </div>
  );
}
