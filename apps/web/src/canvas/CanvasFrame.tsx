/**
 * The canvas renders in a same-origin iframe: styles and theme are isolated from the page (canvas is light only);
 * components stay in the same React tree via a portal and share editor state.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import css from './canvas.css?inline';
import { m } from '@/lib/i18n';

const CanvasDoc = createContext<Document | null>(null);

/** The canvas document (for reading theme colors and screenshots) */
export const useCanvasDocument = () => useContext(CanvasDoc) ?? document;

const KEYS = ['key', 'code', 'shiftKey', 'ctrlKey', 'metaKey', 'altKey', 'repeat'] as const;

/**
 * A document in the canvas's light theme, for reading its colors outside the canvas (e.g. a look's still on the settings page):
 * the canvas on the page if there is one, else a hidden one made for it
 */
let hidden: Promise<Document> | null = null;
export function lightDocument(): Promise<Document> {
  const d = document.querySelector<HTMLIFrameElement>('iframe[data-canvas]')?.contentDocument;
  if (d?.getElementById('canvas-style')) return Promise.resolve(d);
  hidden ??= new Promise(resolve => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden';
    f.srcdoc = "<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>";
    f.onload = () => {
      const doc = f.contentDocument!,
        style = doc.createElement('style');
      style.textContent = css;
      doc.head.appendChild(style);
      resolve(doc);
    };
    document.body.appendChild(f);
  });
  return hidden;
}

export function CanvasFrame({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);

  const mount = () => {
    const d = ref.current?.contentDocument;
    if (!d || d.getElementById('canvas-style')) return;
    const style = d.createElement('style');
    style.id = 'canvas-style';
    style.textContent = css;
    d.head.appendChild(style);
    d.documentElement.lang = document.documentElement.lang;
    setDoc(d);
  };

  // When focus is in the canvas, shortcuts (undo, Esc) are still handled by the page
  useEffect(() => {
    const win = doc?.defaultView;
    if (!win) return;
    const forward = (e: KeyboardEvent) => {
      const init = Object.fromEntries(KEYS.map(k => [k, e[k]]));
      if (!window.dispatchEvent(new KeyboardEvent('keydown', { ...init, cancelable: true }))) e.preventDefault();
    };
    win.addEventListener('keydown', forward);
    return () => win.removeEventListener('keydown', forward);
  }, [doc]);

  // Hot-reload styles in development
  useEffect(() => {
    const el = doc?.getElementById('canvas-style');
    if (el) el.textContent = css;
  }, [doc, css]);

  // Same-origin and script-free by design: React renders into it from this document, which a sandbox would block
  return (
    // oxlint-disable-next-line react/iframe-missing-sandbox
    <iframe
      ref={ref}
      title={m.editor_canvas()}
      data-canvas=""
      srcDoc="<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>"
      onLoad={mount}
      className={className}
    >
      {doc && createPortal(<CanvasDoc.Provider value={doc}>{children}</CanvasDoc.Provider>, doc.body)}
    </iframe>
  );
}
