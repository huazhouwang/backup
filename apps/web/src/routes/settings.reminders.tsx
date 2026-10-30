import { createFileRoute } from '@tanstack/react-router'

import { RemindersCard } from '../features/reminders/RemindersCard'
import { SummariesCard } from '../features/reminders/SummariesCard'
import { SettingsPage } from '../features/settings/SettingsLayout'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/reminders')({
  component: () => (
    <SettingsPage title={m.reminderTitle()}>
      <RemindersCard />
      <SummariesCard />
    </SettingsPage>
  ),
})
