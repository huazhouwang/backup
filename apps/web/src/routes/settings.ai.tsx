import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PageReason, SettingsPage } from '../components/SettingsLayout'
import { isSignedIn } from '../db'
import { MyAi } from '../features/ai/MyAi'
import { aiQueries } from '../features/ai/queries'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  /** Opened by the tab bar's microphone, which needs an AI. */
  from: z.literal('mic').optional().catch(undefined),
})

export const Route = createFileRoute('/settings/ai')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    // Started, not awaited: the page opens at once and finds the data on its way.
    if (await isSignedIn()) void queryClient.prefetchQuery(aiQueries.mine())
  },
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
