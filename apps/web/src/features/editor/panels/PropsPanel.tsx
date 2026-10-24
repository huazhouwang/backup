/** Properties of the selected object; with nothing selected, the level's rule check and the constraints. */
import { objectInfo } from '@plinth/core';
import { useMemo } from 'react';

import { useEditor } from '../store';
import { LevelOverview } from './props/LevelOverview';
import { ObjectProps } from './props/ObjectProps';

export function PropsPanel() {
  const project = useEditor(s => s.project);
  const selected = useEditor(s => s.view.selection[0]);
  const info = useMemo(() => (selected ? objectInfo(project, selected) : null), [project, selected]);
  return info ? <ObjectProps info={info} /> : <LevelOverview />;
}
