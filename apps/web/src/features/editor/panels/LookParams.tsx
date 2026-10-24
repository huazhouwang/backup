/**
 * Look options: the parameters a selected object's look declares (materials, decoration on/off, choices, numbers), set per
 * object with params_set; the look itself stays the same. The controls come from the declarations (ParamControls).
 */
import { elementTarget, findObject, furnitureTarget, lookRecipe, openingTarget, wallTarget, type ParamValue } from '@plinth/core';
import { ParamControls } from '@/features/looks/ParamControls';
import { m } from '@/lib/i18n';
import { useEditor } from '../store';
import { useRun } from './common';

export function LookParams({ id }: { id: string }) {
  const project = useEditor(s => s.project);
  const canEdit = useEditor(s => s.canEdit());
  const run = useRun();
  const e = findObject(project, id);
  if (!e || (e.kind !== 'furniture' && e.kind !== 'opening' && e.kind !== 'element' && !(e.kind === 'wall' && e.obj.kind === 'railing'))) return null;
  const target =
    e.kind === 'furniture'
      ? furnitureTarget(e.obj)
      : e.kind === 'opening'
        ? openingTarget(e.obj)
        : e.kind === 'element'
          ? elementTarget(e.obj)
          : wallTarget(e.obj);
  const recipe = lookRecipe(project, target, e.obj.look);
  if (!recipe?.params || !Object.keys(recipe.params).length) return null;
  const set = (name: string, value: ParamValue) => run('params_set', { object: id, params: { [name]: value } });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{m.looks_params()}</p>
      <ParamControls
        params={recipe.params}
        values={e.obj.lookParams ?? {}}
        onChange={set}
        recipe={recipe}
        design={project.library.materials}
        readOnly={!canEdit}
      />
    </div>
  );
}
