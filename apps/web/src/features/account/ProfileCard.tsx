import { Card, CardTitle } from '@lullabo/ui/card'
import { Input } from '@lullabo/ui/input'
import { useState } from 'react'

import { UserAvatar } from '../../components/UserAvatar'
import { useLocalStore } from '../../db'
import { formatList } from '../../lib/i18n'
import { useOptimisticMutation } from '../../lib/optimistic'
import { m } from '../../paraglide/messages.js'
import { getAccount, setAccount } from '../../sync/local'
import { type SessionUser, type SignInMethods, updateName } from './account'
import { accountKeys } from './queries'

const NAME_MAX = 30

/** Who is signed in: picture, nickname (editable), email and how they sign in. */
export function ProfileCard({
  user,
  methods,
}: {
  user: SessionUser
  methods: SignInMethods | undefined
}) {
  const store = useLocalStore()
  const [name, setName] = useState(user.name)
  const rename = useOptimisticMutation({
    queryKey: accountKeys.me,
    mutationFn: async (next: string) => {
      await updateName(next)
      return { ...user, name: next }
    },
    apply: (current: SessionUser, next: string) => ({ ...current, name: next }),
    // The settings index shows the name kept with the account on this device.
    onSaved: (saved) => {
      const account = getAccount(store)
      if (account) setAccount(store, { ...account, userName: saved.name })
    },
    onRefused: (restored) => setName(restored?.name ?? user.name),
  })
  const via = methods
    ? formatList(
        [
          methods.google ? m.accountViaGoogle() : '',
          methods.password ? m.accountViaPassword() : '',
        ].filter(Boolean),
      )
    : ''

  return (
    <Card as="section" className="flex flex-col gap-3">
      <CardTitle small>{m.accountProfile()}</CardTitle>
      <div className="flex items-center gap-3">
        <UserAvatar name={user.name} image={user.image} size="lg" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-extrabold">{user.name}</span>
          <span className="truncate text-caption text-muted-foreground">{user.email}</span>
        </div>
      </div>
      <Input
        label={m.accountNickname()}
        value={name}
        maxLength={NAME_MAX}
        autoComplete="nickname"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const next = name.trim()
          if (!next) setName(user.name)
          else if (next !== user.name) rename.mutate(next)
        }}
      />
      {via && (
        <p className="m-0 text-caption text-muted-foreground">{m.accountSignsInWith({ via })}</p>
      )}
    </Card>
  )
}
