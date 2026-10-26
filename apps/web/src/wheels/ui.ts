/**
 * Wheel `ui`: page controls in the editor's look (the canvas stylesheet's theme and shadcn's button styles), for pages that have
 * no React. Text comes from the caller, translated.
 */
const BUTTON =
  'inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium shadow-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-accent aria-pressed:text-accent-foreground';

/** A button; `pressed` makes it a toggle that shows when it is on */
export function button(label: string, onClick: () => void, opts: { pressed?: boolean; title?: string } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = BUTTON;
  b.textContent = label;
  if (opts.title) b.title = opts.title;
  if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
  b.addEventListener('click', onClick);
  return b;
}

/** A row of controls (the page places it) */
export function toolbar() {
  const bar = document.createElement('div');
  bar.className = 'flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm';
  bar.setAttribute('role', 'toolbar');
  return bar;
}
