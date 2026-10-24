import { DEFAULT_FINISH, materialOf } from '@plinth/core';
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { MaterialSelect } from '@/features/looks/ParamControls';
import { m, uiName } from '@/lib/i18n';
import { fmtArea } from '@/lib/query';
import { useEditor } from '../../store';
import { kindLabel, Row, useRun } from '../common';
import { type Info } from './shared';

export function SpaceProps({ info }: { info: Info<'space'> }) {
  const materials = useEditor(s => s.project.library.materials);
  const select = useEditor(s => s.select);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  return (
    <div>
      <p className="text-lg font-medium">{fmtArea(info.netArea)}</p>
      <Row k={m.panels_row_kind()} v={kindLabel(info.kind)} />
      <Row k={m.panels_row_bay_depth()} v={`${(info.bounds.width / 1000).toFixed(2)} × ${(info.bounds.depth / 1000).toFixed(2)} m`} />
      {canEdit ? (
        <div className="space-y-1 py-1">
          <p className="text-sm text-muted-foreground">{m.panels_row_floor()}</p>
          <MaterialSelect
            value={info.floor}
            design={materials}
            label={m.panels_row_floor()}
            onChange={floor => run('space_update', { space: info.id, floor })}
          />
        </div>
      ) : (
        <Row k={m.panels_row_floor()} v={uiName(materialOf(info.floor, null, materials)?.name) || info.floor} />
      )}
      <Separator className="my-2" />
      <p className="mb-1 text-xs text-muted-foreground">{m.panels_surroundings()}</p>
      <ItemGroup className="gap-0">
        {info.walls.map(w => (
          <Item key={w.id} size="xs" render={<button type="button" />} onClick={() => select([w.id])} className="cursor-pointer hover:bg-muted">
            <ItemContent>
              <ItemTitle>
                {w.direction} · {w.name}
              </ItemTitle>
            </ItemContent>
            {w.openings.length > 0 && (
              <ItemActions className="text-xs text-muted-foreground">{m.panels_openings_count({ count: w.openings.length })}</ItemActions>
            )}
          </Item>
        ))}
      </ItemGroup>
      {info.neighbors.length > 0 && (
        <>
          <p className="mt-2 mb-1 text-xs text-muted-foreground">{m.panels_neighbors()}</p>
          <p className="text-sm">{info.neighbors.map(n => n.name).join(m.panels_list_separator())}</p>
        </>
      )}
    </div>
  );
}

export function WallProps({ info }: { info: Info<'wall'> }) {
  const project = useEditor(s => s.project);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const finish = project.walls.find(w => w.id === info.id)?.finish ?? DEFAULT_FINISH;
  return (
    <div>
      <Row k={m.panels_row_kind()} v={kindLabel(info.kind)} />
      {info.kind !== 'railing' &&
        (canEdit ? (
          <div className="space-y-1 py-1">
            <p className="text-sm text-muted-foreground">{m.panels_row_finish()}</p>
            <MaterialSelect
              value={finish}
              design={project.library.materials}
              label={m.panels_row_finish()}
              onChange={f => run('wall_update', { wall: info.id, finish: f === DEFAULT_FINISH ? null : f })}
            />
          </div>
        ) : (
          <Row k={m.panels_row_finish()} v={uiName(materialOf(finish, null, project.library.materials)?.name) || finish} />
        ))}
      <Row k={m.panels_row_length()} v={`${(info.length / 1000).toFixed(2)} m`} />
      <Row k={m.panels_row_thickness()} v={`${info.thickness} mm`} />
      <Row k={m.panels_row_sides()} v={info.spaces.map(s => s.space).join(' / ') || '—'} />
      {info.openings.length > 0 && <Row k={m.panels_row_openings()} v={info.openings.map(o => kindLabel(o.kind)).join(m.panels_list_separator())} />}
      {info.kind === 'bearing' && <p className="mt-2 text-xs text-muted-foreground">{m.panels_bearing_note()}</p>}
    </div>
  );
}

export function OpeningProps({ info }: { info: Info<'opening'> }) {
  return (
    <div>
      <Row k={m.panels_row_kind()} v={kindLabel(info.kind)} />
      <Row k={m.panels_row_width_height()} v={`${info.width} × ${info.height} mm`} />
      {info.sill > 0 && <Row k={m.panels_row_sill()} v={`${info.sill} mm`} />}
      <Row k={m.panels_row_host_wall()} v={info.wall.name} />
      <Row k={m.panels_row_connects()} v={info.connects.map(s => s.name).join(' ↔ ') || '—'} />
    </div>
  );
}

export function ElementProps({ info }: { info: Info<'element'> }) {
  const project = useEditor(s => s.project);
  const levelName = (id?: string) => project.levels.find(l => l.id === id)?.name ?? id;
  return (
    <div>
      <Row k={m.panels_row_kind()} v={project.library.elements[info.type]?.name ?? info.type} />
      <Row k={m.panels_row_levels()} v={info.topLevel ? `${levelName(info.level)} → ${levelName(info.topLevel)}` : levelName(info.level)} />
    </div>
  );
}

export function FurnitureProps({ info }: { info: Info<'furniture'> }) {
  return (
    <div>
      <Row k={m.panels_row_category()} v={info.label ?? info.type} />
      <Row k={m.panels_row_size()} v={`${info.size.w} × ${info.size.d} × ${info.size.h} mm`} />
      <Row k={m.panels_row_rotation()} v={`${info.rotation}°`} />
    </div>
  );
}
