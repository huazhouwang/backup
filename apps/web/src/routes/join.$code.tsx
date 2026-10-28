import type { InvitePreview } from '@lullabo/shared'
import { Button } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { FormError } from '@lullabo/ui/form-error'
import { type UseMutationResult, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { PageHeader } from '../components/PageHeader'
import { useLocalStore } from '../db'
import { SignInOptions } from '../features/account/SignInOptions'
import { type JoinOutcome, useJoinInvite, writePending } from '../features/family/join'
import { familyQueries } from '../features/family/queries'
import { roleLabel } from '../features/family/roles'
import { m } from '../paraglide/messages.js'
import { getAccount } from '../sync/local'

export const Route = createFileRoute('/join/$code')({
  loader: ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(familyQueries.invitePreview(params.code)),
  pendingComponent: () => (
    <JoinLayout>
      <p className="text-muted-foreground">{m.joinLoading()}</p>
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
  const join = useJoinInvite(code, preview)
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
        <p className="m-0 text-muted-foreground">
          {m.joinBabies({ names: preview.babyNames.join('、') })}
        </p>
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
            <p className="m-0 text-muted-foreground">{m.joinSignIn()}</p>
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
