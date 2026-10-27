import type { InvitePreview } from '@lullabo/shared'
import { type UseMutationResult, useMutation, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'

import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { FormError } from '../components/ui/FormError'
import { useLocalStore } from '../db'
import { httpAccountApi, signInWithGoogle } from '../features/account/account'
import { connectIfSignedIn } from '../features/account/connection'
import { SignInOptions } from '../features/account/SignInOptions'
import { familyApi } from '../features/family/api'
import { familyQueries } from '../features/family/queries'
import { roleLabel } from '../features/family/roles'
import { HttpError } from '../lib/api'
import { m } from '../paraglide/messages.js'
import { getAccount } from '../sync/local'
import { requestSync } from '../sync/runner'

export const Route = createFileRoute('/join/$code')({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(familyQueries.invitePreview(params.code)),
  pendingComponent: () => (
    <JoinLayout>
      <p className="text-fg-muted">{m.joinLoading()}</p>
    </JoinLayout>
  ),
  // Unknown codes and offline both land here; either way there is no invite to show.
  errorComponent: () => (
    <JoinLayout>
      <p>{m.joinNotFound()}</p>
    </JoinLayout>
  ),
  component: JoinPage,
})

// Set before leaving for Google sign-in, so the invite is accepted when the user returns.
const PENDING_KEY = 'lullabo.pendingInvite'

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
}

function writePending(code: string | null) {
  try {
    if (code) sessionStorage.setItem(PENDING_KEY, code)
    else sessionStorage.removeItem(PENDING_KEY)
  } catch {
    // Without storage the user taps "join" again after signing in.
  }
}

/** Joined, already a member, or left for Google sign-in (the page reloads on return). */
type JoinOutcome = 'joined' | 'member' | 'redirected'

const statusMessage = {
  used: m.joinUsed,
  revoked: m.joinRevoked,
  expired: m.joinExpired,
} as const

function JoinLayout({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <PageHeader title={m.joinTitle()} />
      <Card className="flex flex-col gap-3">{children}</Card>
    </section>
  )
}

function JoinPage() {
  const { code } = Route.useParams()
  const { data: preview } = useSuspenseQuery(familyQueries.invitePreview(code))
  const store = useLocalStore()

  const join = useMutation({
    mutationFn: async (): Promise<JoinOutcome> => {
      if (!(await httpAccountApi.me())) {
        writePending(code)
        await signInWithGoogle(`/join/${code}`)
        return 'redirected'
      }
      writePending(null)
      try {
        await familyApi.acceptInvite(code)
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) return 'member'
        throw error
      }
      // A first sign-in on this device links the account now (the family is already joined);
      // otherwise the next pull sees the new family and fetches its records.
      if (getAccount(store)) await requestSync()
      else await connectIfSignedIn(store)
      return 'joined'
    },
  })

  // Back from Google sign-in with this invite pending: accept it without another tap.
  const { mutate } = join
  const resume = preview.status === 'active' && readPending() === code
  useEffect(() => {
    if (!resume) return
    writePending(null)
    mutate()
  }, [resume, mutate])

  return (
    <JoinLayout>
      <InviteBody code={code} preview={preview} join={join} />
    </JoinLayout>
  )
}

function InviteBody({
  code,
  preview,
  join,
}: {
  code: string
  preview: InvitePreview
  join: UseMutationResult<JoinOutcome, Error, void>
}) {
  const signedIn = getAccount(useLocalStore()) !== undefined
  const navigate = useNavigate()
  const home = (
    <Button size="lg" block onClick={() => void navigate({ to: '/' })}>
      {m.joinGoHome()}
    </Button>
  )

  return (
    <>
      <p className="m-0 text-label font-bold">
        {m.joinBody({
          inviter: preview.inviterName,
          role: roleLabel[preview.role](),
          family: preview.familyName,
        })}
      </p>
      {preview.babyNames && preview.babyNames.length > 0 && (
        <p className="m-0 text-fg-muted">{m.joinBabies({ names: preview.babyNames.join('、') })}</p>
      )}
      {join.data === 'joined' && (
        <>
          <p className="m-0 font-bold">{m.joinDone({ family: preview.familyName })}</p>
          {home}
        </>
      )}
      {join.data === 'member' && (
        <>
          <p className="m-0 font-bold">{m.joinAlreadyMember()}</p>
          {home}
        </>
      )}
      {(join.data === undefined || join.data === 'redirected') &&
        (preview.status !== 'active' ? (
          <FormError>{statusMessage[preview.status]()}</FormError>
        ) : signedIn ? (
          <Button
            size="lg"
            block
            disabled={join.isPending || join.data === 'redirected'}
            onClick={() => join.mutate()}
          >
            {m.joinAccept()}
          </Button>
        ) : (
          <>
            <p className="m-0 text-fg-muted">{m.joinSignIn()}</p>
            <SignInOptions
              returnTo={`/join/${code}`}
              onGoogle={() => writePending(code)}
              onSignedIn={() => join.mutate()}
            />
          </>
        ))}
      {join.isError && <FormError>{m.actionFailed()}</FormError>}
    </>
  )
}
