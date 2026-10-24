/**
 * User-facing text produced by the core package (capability titles, operation-log labels, errors, rule
 * and validation messages). Code carries the English text; the app injects a translator that looks up
 * the same key in its message catalog (web: `core_<key>` in apps/web/messages/*.json).
 * Names written into project data (levels, walls, openings, furniture) are not UI text: they follow the
 * project's language, see names.ts.
 */
export type TextParams = Record<string, string | number>;
export type Translator = (key: string, params: TextParams) => string | undefined;

let translator: Translator | null = null;

/** Install the app's translator (pass null to fall back to English) */
export function setTranslator(fn: Translator | null) {
  translator = fn;
}

/** Translated text for `key`, or the English fallback with `{param}` placeholders filled in */
export function text(key: string, en: string, params: TextParams = {}): string {
  return translator?.(key, params) ?? en.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}
