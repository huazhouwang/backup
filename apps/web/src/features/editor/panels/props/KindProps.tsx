import { DEFAULT_FINISH, materialOf } from '@opensu/core';
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item';
import { Separator } from '@/components/ui/separator';
import { MaterialSelect } from '@/features/looks/ParamControls';
import { m, uiName } from '@/lib/i18n';
import { fmtArea } from '@/lib/query';
import { useEditor } from '../../store';
import { kindLabel, NumberRow, Row, useRun } from '../common';
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
      {canEdit && info.kind !== 'void' && (
        <NumberRow
          k={m.panels_row_target_area()}
          value={Math.round(info.netArea * 10) / 10}
          unit="m²"
          step={0.1}
          onCommit={area => run('space_set_area', { space: info.id, area })}
        />
      )}
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
      <NumberRow
        k={m.panels_row_thickness()}
        value={info.thickness}
        unit="mm"
        readOnly={!canEdit}
        onCommit={thickness => run('wall_update', { wall: info.id, thickness })}
      />
      <NumberRow
        k={m.panels_row_wall_height()}
        value={info.height}
        unit="mm"
        readOnly={!canEdit}
        empty={m.panels_wall_height_storey()}
        onCommit={height => run('wall_update', { wall: info.id, height })}
      />
      <Row k={m.panels_row_sides()} v={info.spaces.map(s => s.space).join(' / ') || '—'} />
      {info.openings.length > 0 && <Row k={m.panels_row_openings()} v={info.openings.map(o => kindLabel(o.kind)).join(m.panels_list_separator())} />}
      {info.kind === 'bearing' && <p className="mt-2 text-xs text-muted-foreground">{m.panels_bearing_note()}</p>}
    </div>
  );
}

export function OpeningProps({ info }: { info: Info<'opening'> }) {
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const set = (patch: Record<string, number | null>) => run('opening_update', { opening: info.id, ...patch });
  return (
    <div>
      <Row k={m.panels_row_kind()} v={kindLabel(info.kind)} />
      <NumberRow k={m.panels_row_width()} value={info.width} unit="mm" readOnly={!canEdit} onCommit={width => set({ width })} />
      <NumberRow k={m.panels_row_height()} value={info.height} unit="mm" readOnly={!canEdit} onCommit={height => set({ height })} />
      <NumberRow k={m.panels_row_sill()} value={info.sill} unit="mm" readOnly={!canEdit} onCommit={sill => set({ sill })} />
      <NumberRow k={m.panels_row_position()} value={Math.round(info.at)} unit="mm" readOnly={!canEdit} onCommit={at => set({ at })} />
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
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const size = (patch: Partial<typeof info.size>) => run('furniture_update', { furniture: info.id, size: patch });
  return (
    <div>
      <Row k={m.panels_row_category()} v={info.label ?? info.type} />
      <NumberRow k={m.panels_row_width()} value={info.size.w} unit="mm" readOnly={!canEdit} onCommit={w => size({ w: w! })} />
      <NumberRow k={m.panels_row_depth()} value={info.size.d} unit="mm" readOnly={!canEdit} onCommit={d => size({ d: d! })} />
      <NumberRow k={m.panels_row_height()} value={info.size.h} unit="mm" readOnly={!canEdit} onCommit={h => size({ h: h! })} />
      <NumberRow
        k={m.panels_row_elevation()}
        value={info.elevation ?? 0}
        unit="mm"
        readOnly={!canEdit}
        onCommit={elevation => run('furniture_update', { furniture: info.id, elevation })}
      />
      <NumberRow
        k={m.panels_row_rotation()}
        value={info.rotation}
        unit="°"
        readOnly={!canEdit}
        onCommit={r => run('furniture_move', { furniture: info.id, rotation: (((r ?? 0) % 360) + 360) % 360 })}
      />
    </div>
  );
}
