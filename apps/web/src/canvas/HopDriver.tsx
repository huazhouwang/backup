/** Wire editor selection and changes to the canvas feedback: hop once on select, fading tint on change */
import { useEffect, useState } from 'react';
import { useEditor } from '@/features/editor/store';
import { useCanvasDocument } from './CanvasFrame';
import { hops } from './hop';

/** The system "reduce motion" setting: no hops (colors still show selection and changes) */
export function useReducedMotion() {
  const win = useCanvasDocument().defaultView ?? window;
  const [reduced, setReduced] = useState(() => win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const q = win.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [win]);
  return reduced;
}

export function HopDriver() {
  const project = useEditor(s => s.project);
  const selection = useEditor(s => s.view.selection);
  const highlight = useEditor(s => s.view.highlight);
  const reduced = useReducedMotion();

  hops.setProject(project);
  hops.reduced = reduced;
  useEffect(() => hops.select(selection), [selection]);
  // Changes, undo, redo and agent focus all produce a new highlight
  useEffect(() => hops.mark(highlight), [highlight]);
  useEffect(() => () => hops.stop(), []);
  return null;
}
