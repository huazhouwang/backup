/** The view: level, mode, selection and highlights, fitting the drawing, and the view host the agent drives it through */
import type { ViewHost } from '../agent/view-capabilities';
import { m } from '@/lib/i18n';
import { levelOf, type StoreContext } from './create';
import type { EditorActions } from './types';

export const viewSlice = ({ set, get }: StoreContext): Pick<EditorActions, 'setView' | 'fitView' | 'select' | 'focus' | 'viewHost'> => ({
  setView(patch) {
    const v = { ...get().view, ...patch };
    set({ view: v });
    return v;
  },

  fitView() {
    set(s => ({ fitRequest: s.fitRequest + 1 }));
  },

  select(ids) {
    // Click on empty space: also clear change highlights
    set(s => ({ view: { ...s.view, selection: ids, highlight: ids.length ? s.view.highlight : [] } }));
  },

  focus(ids, highlight = true) {
    const p = get().project;
    const lv = ids.map(id => levelOf(p, id)).find(Boolean);
    const v = { ...get().view, ...(lv ? { level: lv } : {}), highlight: highlight ? ids : [], selection: ids.slice(0, 1) };
    set({ view: v });
    return v;
  },

  viewHost(): ViewHost {
    return {
      get: () => get().view,
      set: patch => get().setView(patch),
      focus: (ids, hl) => get().focus(ids, hl),
      screenshot: async () => {
        const cap = get().capture;
        if (!cap) throw new Error(m.store_canvas_not_ready());
        return cap();
      },
    };
  },
});
