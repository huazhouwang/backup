import { createFileRoute } from '@tanstack/react-router'

import { SettingsPage } from '../features/settings/SettingsLayout'
import { voiceQueries } from '../features/voice/queries'
import { VoiceCard } from '../features/voice/VoiceCard'
import { prefetchWhenSignedIn } from '../lib/query'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/settings/voice')({
  loader: ({ context: { queryClient } }) =>
    prefetchWhenSignedIn(queryClient, voiceQueries.settings()),
  component: () => (
    <SettingsPage title={m.voiceTitle()}>
      <VoiceCard />
    </SettingsPage>
  ),
})
