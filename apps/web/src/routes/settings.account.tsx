import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { PageReason, SettingsPage } from '../components/SettingsLayout'
import { isSignedIn } from '../db'
import { AccountSettings } from '../features/account/AccountSettings'
import { accountQueries } from '../features/account/queries'
import { m } from '../paraglide/messages.js'

const searchSchema = z.object({
  /** A settings page that needs an account, to go back to once signed in. */
  returnTo: z
    .string()
    .regex(/^\/settings\/[\w/-]+$/)
    .optional()
    .catch(undefined),
  /** Opened by the tab bar's microphone, which needs an account. */
  from: z.literal('mic').optional().catch(undefined),
})

export const Route = createFileRoute('/settings/account')({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient } }) => {
    // Started, not awaited: the page opens at once and finds the data on its way.
    if (await isSignedIn()) {
      void queryClient.prefetchQuery(accountQueries.me())
      void queryClient.prefetchQuery(accountQueries.methods())
      void queryClient.prefetchQuery(accountQueries.passkeys())
    } else {
      void queryClient.prefetchQuery(accountQueries.signInOptions())
    }
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
