import { type ObjectInfo } from '@plinth/core';
import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { m } from '@/lib/i18n';
import { useEditor } from '../../store';
import { useRun } from '../common';
import { LookParams } from '../LookParams';
import { LookPicker } from './LookPicker';
import { SpaceProps, WallProps, OpeningProps, ElementProps, FurnitureProps } from './KindProps';
import { TYPE_LABEL } from './shared';

export function ObjectProps({ info }: { info: ObjectInfo }) {
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  return (
    <div className="space-y-3 p-4">
      <div>
        <p className="text-xs text-muted-foreground">{TYPE_LABEL[info.type]?.() ?? info.type}</p>
        {canEdit && (info.type === 'space' || info.type === 'wall') ? (
          <NameInput
            key={info.id}
            name={info.name}
            onRename={name => run(info.type === 'space' ? 'space_update' : 'wall_update', { [info.type]: info.id, name })}
          />
        ) : (
          <h3 className="text-base font-medium">{'name' in info ? info.name : info.id}</h3>
        )}
      </div>
      {info.type === 'space' && <SpaceProps info={info} />}
      {info.type === 'wall' && <WallProps info={info} />}
      {info.type === 'opening' && <OpeningProps info={info} />}
      {info.type === 'furniture' && <FurnitureProps info={info} />}
      {info.type === 'element' && <ElementProps info={info} />}
      {(info.type === 'furniture' || info.type === 'opening' || info.type === 'element' || (info.type === 'wall' && info.kind === 'railing')) && (
        <LookPicker id={info.id} />
      )}
      {(info.type === 'furniture' || info.type === 'opening' || info.type === 'element' || (info.type === 'wall' && info.kind === 'railing')) && (
        <LookParams id={info.id} />
      )}
      {canEdit && (info.type === 'wall' || info.type === 'opening' || info.type === 'furniture') && (
        <p className="text-xs text-muted-foreground">{m.panels_drag_hint()}</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2 pt-1">
          {info.type === 'furniture' && (
            <>
              <Button size="sm" variant="outline" onClick={() => run('furniture_move', { furniture: info.id, rotation: (info.rotation + 90) % 360 })}>
                {m.panels_rotate_90()}
              </Button>
              <Button size="sm" variant="outline" onClick={() => run('furniture_remove', { furniture: info.id })}>
                <Trash2Icon /> {m.panels_remove_furniture()}
              </Button>
            </>
          )}
          {info.type === 'opening' && (
            <Button size="sm" variant="outline" onClick={() => run('opening_remove', { opening: info.id })}>
              <Trash2Icon /> {m.panels_remove_opening()}
            </Button>
          )}
          {info.type === 'wall' && info.kind !== 'bearing' && (
            <Button size="sm" variant="outline" onClick={() => run('wall_remove', { wall: info.id })}>
              <Trash2Icon /> {m.panels_remove_wall()}
            </Button>
          )}
          {info.type === 'space' && (
            <Button size="sm" variant="outline" onClick={() => run('space_remove', { space: info.id })}>
              <Trash2Icon /> {m.panels_remove_space()}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Editable name: commits on blur or Enter */
export function NameInput({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      className="mt-1 h-8 font-medium"
      value={draft ?? name}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (draft && draft !== name) onRename(draft);
        setDraft(null);
      }}
      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      aria-label={m.panels_name()}
    />
  );
}
