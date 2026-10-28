import { Card } from '@lullabo/ui/card'
import { createFileRoute } from '@tanstack/react-router'

import { BabyList } from '../features/babies/BabyList'
import { SettingsPage } from '../features/settings/SettingsLayout'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/babies')({
  component: () => (
    <SettingsPage title={m.settingsBabies()}>
      <Card>
        <BabyList />
      </Card>
    </SettingsPage>
  ),
})
