import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AccountSettings } from '../features/account/AccountSettings'
import { accountQueries } from '../features/account/queries'
import { PageReason, SettingsPage } from '../features/settings/SettingsLayout'
import { fromMic } from '../features/voice/search'
import { prefetchWhenSignedIn } from '../lib/query'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  /** A settings page that needs an account, to go back to once signed in. */
  returnTo: z
    .string()
    .regex(/^\/settings\/[\w/-]+$/)
    .optional()
    .catch(undefined),
  /** Opened by the tab bar's microphone, which needs an account. */
  from: fromMic,
})

export const Route = createFileRoute('/settings/account')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    const signedIn = await prefetchWhenSignedIn(
      queryClient,
      accountQueries.me(),
      accountQueries.methods(),
      accountQueries.passkeys(),
    )
    if (!signedIn) void queryClient.prefetchQuery(accountQueries.signInOptions())
  },
  component: AccountPage,
})

function AccountPage() {
  const { returnTo, from } = Route.useSearch()
  return (
    <SettingsPage title={m.accountTitle()}>
      {from === 'mic' && <PageReason>{m.tabMicSignIn()}</PageReason>}
      <AccountSettings returnTo={returnTo} />
    </SettingsPage>
  )
}
