/**
 * Editor UI state the canvas and the panels share: the before/after comparison, the screenshot, messages for the agent, the 2D/3D
 * switch, place mode, the section tool, what the 3D view shows and where the sun stands
 */
import { localKey, readLocal } from '@/lib/local';
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
  | 'sectioning'
  | 'camera3d'
  | 'sun'
  | 'sunOpen'
  | 'widgetsOpen'
  | 'sandboxCanvas'
  | 'northRequest'
> &
  Pick<
    EditorActions,
    | 'setCompare'
    | 'setCapture'
    | 'askAgent'
    | 'setLeave3D'
    | 'setPlanUntil3D'
    | 'setPlacing'
    | 'setSectioning'
    | 'setCamera3d'
    | 'setSun'
    | 'faceNorth'
    | 'setSunOpen'
    | 'setWidgetsOpen'
    | 'setSandboxCanvas'
  >;

/** The sample room (issue 171): the plan drawn by the sandboxed canvas page instead of the editor's own; remembered in this browser */
const SANDBOX_KEY = 'sandboxCanvas';
function readSandboxCanvas() {
  try {
    return typeof localStorage !== 'undefined' && readLocal(SANDBOX_KEY) === '1';
  } catch {
    return false;
  }
}

export const uiSlice = ({ set }: StoreContext): Ui => ({
  compare: false,
  capture: null,
  ask: null,
  fitRequest: 0,
  leave3D: null,
  planUntil3D: false,
  placing: null,
  sectioning: false,
  camera3d: { walking: false, section: null },
  // Today at three in the afternoon
  sun: { day: dayOfYear(new Date()), minutes: 15 * 60 },
  sunOpen: false,
  widgetsOpen: false,
  sandboxCanvas: readSandboxCanvas(),
  northRequest: 0,

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
    set({ placing, ...(placing ? { sectioning: false } : {}) });
  },

  setSectioning(sectioning) {
    set({ sectioning, ...(sectioning ? { placing: null } : {}) });
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

  setSandboxCanvas(on) {
    try {
      localStorage.setItem(localKey(SANDBOX_KEY), on ? '1' : '');
    } catch {
      // Storage blocked: the choice lasts for this page only
    }
    set({ sandboxCanvas: on });
  },
  setWidgetsOpen(widgetsOpen) {
    set({ widgetsOpen });
  },
});
