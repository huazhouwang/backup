import { buttonVariants } from '@lullabo/ui/button'
import { Card } from '@lullabo/ui/card'
import { Link, useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { m } from '../../paraglide/messages.js'

/** What a page offers once signed in, with a way to sign in and come back here. */
export function SignInNotice({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <Card className="flex flex-col gap-3">
      <p className="m-0 text-muted-foreground">{children}</p>
      <Link
        to="/settings/account"
        search={{ returnTo: pathname }}
        className={buttonVariants({ block: true })}
      >
        {m.signInOrUpAction()}
      </Link>
    </Card>
  )
}
