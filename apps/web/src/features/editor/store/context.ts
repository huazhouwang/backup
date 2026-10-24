/** The open editor's store in React: provided by the editor, read with useEditor(selector) */
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { EditorStore } from './create';
import type { EditorActions, EditorState } from './types';

export const EditorContext = createContext<EditorStore | null>(null);

export function useEditor<T>(selector: (s: EditorState & EditorActions) => T): T {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditor must be used inside EditorContext');
  return useStore(store, selector);
}

export function useEditorStore() {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditorStore must be used inside EditorContext');
  return store;
}
