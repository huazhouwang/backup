/**
 * Editor UI state the canvas and the panels share: the before/after comparison, the screenshot, messages for the agent, the 2D/3D
 * switch, place mode, the tape measure, the section tool, what the 3D view shows and where the sun stands
 */
import { dayOfYear } from '@/lib/solar';
import type { StoreContext } from './create';
import type { EditorActions, EditorState } from './types';

type Ui = Pick<
  EditorState,
  | 'compare'
  | 'capture'
  | 'ask'
  | 'fitRequest'
  | 'leave3D'
  | 'planUntil3D'
  | 'placing'
  | 'measuring'
  | 'sectioning'
  | 'camera3d'
  | 'sun'
  | 'sunOpen'
  | 'northRequest'
  | 'guideEdit'
  | 'axesEdit'
> &
  Pick<
    EditorActions,
    | 'setCompare'
    | 'setCapture'
    | 'askAgent'
    | 'setLeave3D'
    | 'setPlanUntil3D'
    | 'setPlacing'
    | 'setMeasuring'
    | 'setSectioning'
    | 'setCamera3d'
    | 'setSun'
    | 'faceNorth'
    | 'setGuideEdit'
    | 'setAxesEdit'
    | 'setSunOpen'
  >;

export const uiSlice = ({ set }: StoreContext): Ui => ({
  compare: false,
  capture: null,
  ask: null,
  fitRequest: 0,
  leave3D: null,
  planUntil3D: false,
  placing: null,
  measuring: false,
  sectioning: false,
  camera3d: { walking: false, section: null },
  // Today at three in the afternoon
  sun: { day: dayOfYear(new Date()), minutes: 15 * 60 },
  sunOpen: false,
  northRequest: 0,
  guideEdit: null,
  axesEdit: null,

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

  // One tool at a time: taking one out puts the others away
  setPlacing(placing) {
    set({ placing, ...(placing ? { measuring: false, sectioning: false, axesEdit: null } : {}) });
  },

  setMeasuring(measuring) {
    set({ measuring, guideEdit: null, ...(measuring ? { placing: null, sectioning: false, axesEdit: null } : {}) });
  },

  setSectioning(sectioning) {
    set({ sectioning, ...(sectioning ? { placing: null, measuring: false, axesEdit: null } : {}) });
  },

  setCamera3d(patch) {
    set(s => ({ camera3d: { ...s.camera3d, ...patch } }));
  },

  setSun(patch) {
    set(s => ({ sun: { ...s.sun, ...patch } }));
  },

  faceNorth() {
    set({ northRequest: Date.now() });
  },

  setSunOpen(sunOpen) {
    set({ sunOpen });
  },

  setGuideEdit(guideEdit) {
    set({ guideEdit });
  },

  // Selecting the axes puts the tools away
  setAxesEdit(axesEdit) {
    set({ axesEdit, ...(axesEdit ? { placing: null, measuring: false, sectioning: false } : {}) });
  },
});
