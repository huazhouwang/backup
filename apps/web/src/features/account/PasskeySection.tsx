import { Button } from '@lullabo/ui/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { formatDate } from '../../lib/i18n'
import { m } from '../../paraglide/messages.js'
import {
  type PasskeyInfo,
  addPasskey,
  deletePasskey,
  isPasskeyCancel,
  needsFreshSignIn,
  passkeysSupported,
} from './passkey'
import { accountKeys, accountQueries } from './queries'

/**
 * The signed-in account's passkeys: remove old ones, and add one for this device when
 * `canAdd` (accounts with a password; Google already signs in without typing one).
 */
export function PasskeySection({ canAdd }: { canAdd: boolean }) {
  const queryClient = useQueryClient()
  const list = useQuery(accountQueries.passkeys())
  const [message, setMessage] = useState<string>()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKeys.passkeys }),
      queryClient.invalidateQueries({ queryKey: accountKeys.methods }),
    ])

  const add = useMutation({
    mutationFn: () => addPasskey(m.passkeyDefaultName({ date: formatDate(Date.now()) })),
    onMutate: () => setMessage(undefined),
    onSuccess: async () => {
      await refresh()
      setMessage(m.passkeyAdded())
    },
    onError: (error) => {
      if (isPasskeyCancel(error)) return
      setMessage(needsFreshSignIn(error) ? m.passkeyNeedsFreshSignIn() : m.passkeyAddFailed())
    },
  })
  const remove = useMutation({
    mutationFn: deletePasskey,
    onMutate: () => setMessage(undefined),
    onSuccess: refresh,
    onError: () => setMessage(m.actionFailed()),
  })

  // A failed list (e.g. offline) still offers adding one.
  const passkeys: PasskeyInfo[] | undefined = list.isError ? [] : list.data
  if (!passkeysSupported() || !passkeys || (!canAdd && passkeys.length === 0)) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 font-extrabold">{m.passkeyTitle()}</h3>
      {canAdd && <p className="m-0 text-caption text-muted-foreground">{m.passkeyIntro()}</p>}
      {passkeys.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {passkeys.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {item.name || formatDate(new Date(item.createdAt))}
              </span>
              <Button
                variant="ghost"
                tone="destructive"
                aria-label={m.passkeyRemoveLabel({ name: item.name ?? '' })}
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.id)}
              >
                {m.passkeyRemove()}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <Button variant="soft" tone="primary" disabled={add.isPending} onClick={() => add.mutate()}>
          {m.passkeyAdd()}
        </Button>
      )}
      {message && <output className="m-0 font-bold">{message}</output>}
    </section>
  )
}
