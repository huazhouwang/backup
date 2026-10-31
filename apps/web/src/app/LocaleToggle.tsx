import {
  type Locale,
  getLocale,
  localeName,
  localeShortName,
  locales,
  setLocale,
} from '../lib/i18n'
import { m } from '../paraglide/messages.js'

/** Both language names, the active one highlighted; a click switches to the other one. */
export function LocaleToggle() {
  const current = getLocale()
  const next: Locale = locales[(locales.indexOf(current) + 1) % locales.length] ?? current
  return (
    <button
      type="button"
      // Saves the choice and reloads the app in that language.
      onClick={() => void setLocale(next)}
      aria-label={`${m.languageSwitch()}: ${localeName(next)}`}
      title={m.languageSwitch()}
      className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {locales.map((locale, index) => (
        <span key={locale} className="inline-flex items-center gap-1">
          {index > 0 && <span aria-hidden>{'/'}</span>}
          <span className={locale === current ? 'font-medium text-foreground' : undefined}>
            {localeShortName(locale)}
          </span>
        </span>
      ))}
    </button>
  )
}
