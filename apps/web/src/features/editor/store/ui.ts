/** Editor UI state the canvas and the panels share: the before/after comparison, the screenshot, messages for the agent, the 2D/3D switch */
import type { StoreContext } from './create';
import type { EditorActions, EditorState } from './types';

type Ui = Pick<EditorState, 'compare' | 'capture' | 'ask' | 'fitRequest' | 'leave3D' | 'planUntil3D'> &
  Pick<EditorActions, 'setCompare' | 'setCapture' | 'askAgent' | 'setLeave3D' | 'setPlanUntil3D'>;

export const uiSlice = ({ set }: StoreContext): Ui => ({
  compare: false,
  capture: null,
  ask: null,
  fitRequest: 0,
  leave3D: null,
  planUntil3D: false,

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
});
