import { createFileRoute } from '@tanstack/react-router'

import { ExportCard } from '../features/export/ExportCard'
import { SettingsPage } from '../features/settings/SettingsLayout'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/export')({
  component: () => (
    <SettingsPage title={m.exportTitle()}>
      <ExportCard />
    </SettingsPage>
  ),
})
