import { createFileRoute } from '@tanstack/react-router'

import { CuesCard } from '../features/settings/CueSettings'
import { LanguageCard, ThemeCard } from '../features/settings/DisplaySettings'
import { SettingsPage } from '../features/settings/SettingsLayout'
import { UnitsCard } from '../features/settings/UnitsCard'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/display')({
  component: () => (
    <SettingsPage title={m.settingsDisplay()}>
      <ThemeCard />
      <UnitsCard />
      <CuesCard />
      <LanguageCard />
    </SettingsPage>
  ),
})
