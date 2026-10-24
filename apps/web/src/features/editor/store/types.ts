/** The editor store's state and actions, and what a project page opens it with */
import type { Actor, CallResult, Project, Session, TxResult } from '@plinth/core';
import type { ViewHost, ViewState } from '../agent/view-capabilities';
import type { Role } from '@/shared/roles';

export interface LastChange {
  label: string;
  actor: Actor['kind'];
  before: Project;
  changed: string[];
  areaChanges: TxResult['areaChanges'];
  warnings: NonNullable<CallResult['warnings']>;
  at: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  model: string;
}

/** The model the project uses: the pinned one, else the owner's default */
export const projectModel = (s: Pick<EditorState, 'models' | 'projectModelId' | 'defaultModelId'>) =>
  s.models.find(x => x.id === (s.projectModelId ?? s.defaultModelId)) ?? null;

export interface EditorState {
  projectId: string;
  name: string;
  role: Role;
  version: number;
  /** The owner's models (editors chat with them) */
  models: ModelOption[];
  /** The model the owner pinned for the project; null uses the owner's default */
  projectModelId: string | null;
  defaultModelId: string | null;
  session: Session;
  project: Project;
  view: ViewState;
  readOnlyVersion: number | null;
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  pendingLabels: string[];
  conflict: { version: number; content: Project } | null;
  lastChange: LastChange | null;
  /** The look just added or changed (by the agent or the user), for the chat's preview card */
  lookChange: { id: string; isNew: boolean; at: number } | null;
  compare: boolean;
  /** Screenshot function registered by the canvas */
  capture: (() => Promise<{ dataUrl: string; width: number; height: number }>) | null;
  /** A message handed to the agent from elsewhere in the editor (e.g. a comment); the chat panel sends it */
  ask: { text: string; at: number } | null;
  /** Bumped by "fit all": the plan and the 3D view frame the whole drawing again when it changes */
  fitRequest: number;
  /** Registered by the 3D view: plays the house sinking back into the plan; the view switch waits for it before showing the plan */
  leave3D: (() => Promise<void>) | null;
  /**
   * Keep the plan on screen after switching to 3D until the 3D view's first frame is ready (loading code, drawing the floors).
   * That frame is the same picture as the plan, so the plan then goes away without a visible change.
   */
  planUntil3D: boolean;
}

export interface EditorActions {
  call(name: string, input: unknown, actor?: Actor): Promise<CallResult>;
  /** The project as it would be after this call, from a scratch copy (nothing is committed); null if the call fails */
  preview(name: string, input: unknown): Promise<Project | null>;
  setView(patch: Partial<ViewState>): ViewState;
  fitView(): void;
  setLeave3D(fn: (() => Promise<void>) | null): void;
  setPlanUntil3D(on: boolean): void;
  select(ids: string[]): void;
  focus(ids: string[], highlight?: boolean): ViewState;
  undo(): void;
  redo(): void;
  /** Save if dirty. checkpoint: a deliberate save (restore) that the server must keep apart from the autosave before it */
  save(opts?: { force?: boolean; checkpoint?: boolean }): Promise<void>;
  resolveConflict(keep: 'mine' | 'theirs'): Promise<void>;
  setCompare(on: boolean): void;
  /** Close the look preview card */
  clearLookChange(): void;
  setCapture(fn: EditorState['capture']): void;
  loadVersion(version: number | null): Promise<void>;
  /** Make an earlier version the latest one (saved as a new version) */
  restoreVersion(version: number): Promise<void>;
  askAgent(text: string): void;
  /** Follow session changes (mark dirty, autosave) while the editor is open; returns the disconnect function */
  connect(): () => void;
  viewHost(): ViewHost;
  canEdit(): boolean;
}

export interface InitialProject {
  id: string;
  name: string;
  role: Role;
  version: number;
  content: Project;
  models?: ModelOption[];
  projectModelId?: string | null;
  defaultModelId?: string | null;
}
