/**
 * UI translations (Paraglide). Use `m.some_key()` for every user-visible string; never hard-code UI text.
 * Messages live in apps/web/messages/{locale}.json; a key missing from a locale falls back to Chinese.
 * Shared by the browser and the Worker (the Worker resolves the locale per request from the cookie).
 */
import { nameIn, setTranslator, type Names } from '@plinth/core';
import { m } from '@/paraglide/messages';
import { getLocale, locales, setLocale, type Locale } from '@/paraglide/runtime';

export { m, getLocale, locales, setLocale, type Locale };

/** BCP 47 tag for <html lang> and for the agent's context */
export const htmlLang = (l: Locale = getLocale()) => (l === 'zh' ? 'zh-CN' : l);

// Text from the core package (errors, capability titles, rule messages) is looked up as core_<key>
const messages = m as unknown as Record<string, ((p: object) => string) | undefined>;
setTranslator((key, params) => messages[`core_${key}`]?.(params));

/** Text from library data ({ zh, en }) in the UI language, else in whatever language it has */
export const uiName = (n: Names | string | undefined) => nameIn(n, getLocale() === 'en' ? 'en' : 'zh');
