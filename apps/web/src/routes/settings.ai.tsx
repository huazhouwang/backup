import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { MyAi } from '../features/ai/MyAi'
import { aiQueries } from '../features/ai/queries'
import { PageReason, SettingsPage } from '../features/settings/SettingsLayout'
import { fromMic } from '../features/voice/search'
import { prefetchWhenSignedIn } from '../lib/query'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  /** Opened by the tab bar's microphone, which needs an AI. */
  from: fromMic,
})

export const Route = createFileRoute('/settings/ai')({
  validateSearch: searchSchema,
  loader: ({ context: { queryClient } }) => prefetchWhenSignedIn(queryClient, aiQueries.mine()),
  component: AiPage,
})

function AiPage() {
  const { from } = Route.useSearch()
  return (
    <SettingsPage title={m.aiMineTitle()}>
      {from === 'mic' && <PageReason>{m.tabMicNoAi()}</PageReason>}
      <MyAi />
    </SettingsPage>
  )
}
