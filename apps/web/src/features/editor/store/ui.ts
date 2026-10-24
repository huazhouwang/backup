/**
 * Editor UI state the canvas and the panels share: the before/after comparison, the screenshot, messages for the agent, the 2D/3D
 * switch, place mode, the tape measure
 */
import type { StoreContext } from './create';
import type { EditorActions, EditorState } from './types';

type Ui = Pick<EditorState, 'compare' | 'capture' | 'ask' | 'fitRequest' | 'leave3D' | 'planUntil3D' | 'placing' | 'measuring'> &
  Pick<EditorActions, 'setCompare' | 'setCapture' | 'askAgent' | 'setLeave3D' | 'setPlanUntil3D' | 'setPlacing' | 'setMeasuring'>;

export const uiSlice = ({ set }: StoreContext): Ui => ({
  compare: false,
  capture: null,
  ask: null,
  fitRequest: 0,
  leave3D: null,
  planUntil3D: false,
  placing: null,
  measuring: false,

  setCompare(on) {
    set({ compare: on });
  },

  setCapture(fn) {
    set({ capture: fn });
  },

  askAgent(text) {
    set({ ask: { text, at: Date.now() } });
  },

  setLeave3D(fn) {
    set({ leave3D: fn });
  },

  setPlanUntil3D(planUntil3D) {
    set({ planUntil3D });
  },

  setPlacing(placing) {
    set({ placing, ...(placing ? { measuring: false } : {}) });
  },

  setMeasuring(measuring) {
    set({ measuring, ...(measuring ? { placing: null } : {}) });
  },
});
