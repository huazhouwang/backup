import { Card, CardTitle } from '@lullabo/ui/card'
import { createFileRoute } from '@tanstack/react-router'

import { VersionCard } from '../features/settings/AppVersion'
import { ClearCacheCard } from '../features/settings/ClearCacheCard'
import { InstallCard } from '../features/settings/InstallCard'
import { SettingsPage } from '../features/settings/SettingsLayout'
import { StorageStatus } from '../features/settings/StorageStatus'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/about')({
  component: () => (
    <SettingsPage title={m.settingsAbout()}>
      <InstallCard />
      <Card className="flex flex-col gap-2">
        <CardTitle>{m.storageTitle()}</CardTitle>
        <StorageStatus />
      </Card>
      <ClearCacheCard />
      <VersionCard />
    </SettingsPage>
  ),
})
