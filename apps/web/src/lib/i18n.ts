import { getLocale, locales, setLocale } from '../paraglide/runtime.js'

export { getLocale, locales, setLocale }
export type Locale = (typeof locales)[number]

/**
 * A locale's name in its own language ("English", "中文"), for the language pickers. Names
 * the language only: there is one locale per language.
 */
export function localeName(locale: Locale): string {
  const language = locale.split('-')[0] ?? locale
  return new Intl.DisplayNames([locale], { type: 'language' }).of(language) ?? locale
}

/** A short label for the compact toggle: "EN" for English, the native name otherwise. */
export function localeShortName(locale: Locale): string {
  return locale === 'en' ? locale.toUpperCase() : localeName(locale)
}
