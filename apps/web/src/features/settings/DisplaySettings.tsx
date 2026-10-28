import { Card, CardTitle } from '@lullabo/ui/card'
import { SegmentedControl } from '@lullabo/ui/segmented-control'

import { type Locale, getLocale, localeDisplayName, locales, setLocale } from '../../lib/i18n'
import type { ThemePreference } from '../../lib/theme'
import { unitLabel, useUnits } from '../../lib/units'
import { useTheme } from '../../lib/use-theme'
import { m } from '../../paraglide/messages.js'
import { useAccount } from '../../sync/use-access'
import { voiceApi } from '../voice/api'

const themeLabel: Record<ThemePreference, () => string> = {
  system: m.themeSystem,
  light: m.themeLight,
  dark: m.themeDark,
}
const themes = ['system', 'light', 'dark'] as const

/** "跟随系统 · ml · kg": the theme and the most used units, for the settings index. */
export function useDisplaySummary() {
  const { preference } = useTheme()
  const units = useUnits()
  return [themeLabel[preference](), unitLabel('volume', units), unitLabel('weight', units)].join(
    ' · ',
  )
}

export function ThemeCard() {
  const { preference, setPreference } = useTheme()
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{m.settingsTheme()}</CardTitle>
      <SegmentedControl
        label={m.settingsTheme()}
        options={themes.map((value) => ({ value, label: themeLabel[value]() }))}
        value={preference}
        onChange={setPreference}
      />
    </Card>
  )
}

/** Hidden until a second locale ships; switching reloads the app in that locale. */
export function LanguageCard() {
  const signedIn = useAccount() !== undefined
  if (locales.length < 2) return null
  const change = async (locale: Locale) => {
    // Siri replies in the app's language; the reload below would cut this request short.
    if (signedIn) await voiceApi.saveLocale(locale).catch(() => undefined)
    await setLocale(locale)
  }
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>{m.settingsLanguage()}</CardTitle>
      <SegmentedControl<Locale>
        label={m.settingsLanguage()}
        options={locales.map((locale) => ({ value: locale, label: localeDisplayName(locale) }))}
        value={getLocale()}
        onChange={(locale) => void change(locale)}
      />
    </Card>
  )
}
