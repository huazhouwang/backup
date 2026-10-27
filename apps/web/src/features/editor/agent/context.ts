/** What the agent is told about the editor along with each message: project, view, selection, levels, brief. */
import { findObject } from '@opensu/core';
import type { EditorState } from '@/features/editor/store';
import type { AgentContext } from './prompt';

export function agentContext({ project: p, role, view, sandboxCanvas }: Pick<EditorState, 'project' | 'role' | 'view' | 'sandboxCanvas'>): AgentContext {
  return {
    projectName: p.name,
    role,
    uiLanguage: document.documentElement.lang,
    view: { mode: view.mode, level: p.levels.find(l => l.id === view.level)?.name ?? view.level },
    selection: view.selection.map(id => {
      const o = findObject(p, id);
      return { id, name: o?.name ?? id, type: o?.kind ?? 'unknown' };
    }),
    levels: p.levels.map(l => ({ id: l.id, name: l.name, spaces: p.spaces.filter(x => x.level === l.id).map(x => x.name) })),
    brief: p.brief,
    constraints: p.constraints.length,
    ...(sandboxCanvas ? { sandboxCanvas: true } : {}),
  };
}
