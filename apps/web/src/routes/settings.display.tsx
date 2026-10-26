import { createFileRoute } from '@tanstack/react-router'

import { CuesCard } from '../components/CueSettings'
import { LanguageCard, ThemeCard } from '../components/DisplaySettings'
import { SettingsPage } from '../components/SettingsLayout'
import { UnitsCard } from '../components/UnitsCard'
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
