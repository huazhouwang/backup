import { Button } from '@lullabo/ui/button'
import { Card, CardTitle } from '@lullabo/ui/card'
import { Sheet } from '@lullabo/ui/sheet'
import { count, useLiveQuery } from '@tanstack/react-db'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { ConfirmSheet } from '../../components/ConfirmSheet'
import { useLocalStore } from '../../db'
import { formatTime } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import { requestSync, useSyncState } from '../../sync/runner'
import { useAccount } from '../../sync/use-access'
import { disablePush } from '../reminders/notifications'
import { revokeThisDeviceToken } from '../voice/api'
import { deleteAccountRemote, disconnectLocal, signOutRemote } from './account'
import { ChangePassword } from './ChangePassword'
import { connectIfSignedIn } from './connection'
import { PasskeySection } from './PasskeySection'
import { ProfileCard } from './ProfileCard'
import { accountQueries } from './queries'
import { SignInOptions } from './SignInOptions'

/** One line describing the sync state, for the account page and its settings row. */
export function useSyncStatusText() {
  const { phase, lastSyncedAt } = useSyncState()
  return phase === 'syncing'
    ? m.syncStatusSyncing()
    : phase === 'offline'
      ? m.syncStatusOffline()
      : phase === 'error'
        ? m.syncStatusError()
        : phase === 'unauthorized'
          ? m.syncStatusUnauthorized()
          : lastSyncedAt
            ? m.syncStatusIdle({ time: formatTime(lastSyncedAt) })
            : m.syncStatusNever()
}

/** The account page: profile, sync, sign-in and security, then signing out. */
export function AccountSettings({ returnTo }: { returnTo?: string }) {
  const store = useLocalStore()
  const account = useAccount()
  const router = useRouter()

  if (!account) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="m-0 text-muted-foreground">{m.accountSignedOutBody()}</p>
        <SignInOptions
          returnTo={returnTo}
          onSignedIn={async () => {
            await connectIfSignedIn(store)
            if (returnTo) router.history.push(returnTo)
          }}
        />
      </Card>
    )
  }
  return <SignedIn userId={account.userId} userName={account.userName} />
}

function SignedIn({ userId, userName = '' }: { userId: string; userName?: string }) {
  const store = useLocalStore()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const { data: me } = useQuery(accountQueries.me())
  const { data: methods } = useQuery(accountQueries.methods())
  // Offline before the first answer: what this device knows.
  const user = me ?? { id: userId, name: userName, email: '', image: null }

  // Keeps everything on the device if the server could not delete the account.
  const deleteAccount = useMutation({
    mutationFn: deleteAccountRemote,
    onSuccess: async () => {
      await disablePush().catch(() => undefined)
      disconnectLocal(store, true)
      queryClient.clear()
      setDeleting(false)
    },
  })

  async function signOut(clearData: boolean) {
    // Reminders for this account shouldn't keep arriving on this device, and the Siri
    // shortcut set up here shouldn't keep logging for it.
    await disablePush().catch(() => undefined)
    await revokeThisDeviceToken().catch(() => undefined)
    try {
      await signOutRemote()
    } catch {
      // Already signed out on the server, or offline; forget the account locally anyway.
    }
    disconnectLocal(store, clearData)
    // Cached lists (passkeys, reminders, members) belonged to the account that left.
    queryClient.clear()
    setSigningOut(false)
  }

  // Google accounts already sign in without a password; passkeys are for password ones
  // (and any the account already has, so they can be removed).
  const password = methods?.password === true
  const showPasskeys = password || (methods?.passkeys ?? 0) > 0

  return (
    <>
      {/* Remounted once the server's copy replaces this device's, to edit from it. */}
      <ProfileCard key={me ? 'server' : 'local'} user={user} methods={methods} />
      <SyncCard />
      {(showPasskeys || password) && (
        <Card as="section" className="flex flex-col gap-3">
          <CardTitle small>{m.accountSecurity()}</CardTitle>
          {showPasskeys && <PasskeySection canAdd={password} />}
          {password && user.email && <ChangePassword email={user.email} />}
        </Card>
      )}
      <Button variant="outline" block onClick={() => setSigningOut(true)}>
        {m.signOut()}
      </Button>
      <Sheet open={signingOut} onClose={() => setSigningOut(false)} title={m.signOut()}>
        <Button block onClick={() => void signOut(false)}>
          {m.signOutKeep()}
        </Button>
        <Button variant="ghost" tone="destructive" block onClick={() => void signOut(true)}>
          {m.signOutClear()}
        </Button>
        <p className="m-0 text-center text-caption text-muted-foreground">{m.signOutClearHint()}</p>
      </Sheet>
      <Button variant="ghost" tone="destructive" onClick={() => setDeleting(true)}>
        {m.accountDelete()}
      </Button>
      <ConfirmSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        title={m.accountDelete()}
        confirmLabel={m.actionDeleteForever()}
        onConfirm={() => deleteAccount.mutate()}
        busy={deleteAccount.isPending}
        error={deleteAccount.isError ? m.accountDeleteFailed() : undefined}
      >
        {m.accountDeleteBody()}
      </ConfirmSheet>
    </>
  )
}

/** Sync status, changes waiting to upload, and syncing now. */
function SyncCard() {
  const store = useLocalStore()
  const { data: outbox } = useLiveQuery(
    (q) =>
      q
        .from({ entry: store.outbox })
        .select(({ entry }) => ({ n: count(entry.key) }))
        .findOne(),
    [store],
  )
  const pending = outbox?.n ?? 0
  return (
    <Card as="section" className="flex flex-col gap-3">
      <CardTitle small>{m.accountSync()}</CardTitle>
      <p className="m-0 text-muted-foreground">{useSyncStatusText()}</p>
      {pending > 0 && (
        <p className="m-0 text-caption text-muted-foreground">
          {m.syncPending({ count: pending })}
        </p>
      )}
      <Button variant="soft" tone="diaper" onClick={() => void requestSync()}>
        {m.syncNow()}
      </Button>
    </Card>
  )
}
