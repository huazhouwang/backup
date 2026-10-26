/**
 * The wheels (issue 171): ready-made code a canvas page imports as `plinth` instead of rewriting it. The editor bundles this file
 * (vite.config.ts, `virtual:canvas-wheels`) and inlines it into the sandboxed canvas page. A page may use all of it (start() lays
 * out the default page), parts of it, or none.
 *
 * - bridge: the design, the level, the selection; capability calls (connect() first)
 * - plan: mount() the plan of the current level, with layers to draw in and tools to take the pointer
 * - interact: selectable, draggable, snap points and lines everything snaps to
 * - walls: the wall tool
 * - ui: buttons and a toolbar in the editor's look
 */
export { bridge, connect, report } from './bridge';
export { type ModuleCanvas } from './modules';
export { mount, svgEl, type PlanView, type Tool } from './plan';
export { addSnaps, draggable, isSelected, onSelection, selectable, snap, SNAP_PX, snapPoints, type SnapProvider, type Snapped } from './interact';
export { wallTool } from './walls';
export { button, toolbar } from './ui';
export { defaultPage, start, type Canvas } from './page';
