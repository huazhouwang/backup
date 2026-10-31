import { APP_NAME } from '@folio/shared'
import { Button } from '@folio/ui/components/motion/button/base'
import { Input } from '@folio/ui/components/motion/input'
import { Tabs, TabsList, TabsTrigger } from '@folio/ui/components/motion/tabs'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'

import { LocaleToggle } from '../app/LocaleToggle'
import { ThemeToggle } from '../app/ThemeToggle'
import { Logo } from '../components/Logo'
import { authErrorMessage, meQuery, signIn, signUp } from '../features/auth/auth'
import { MIN_PASSWORD_LENGTH } from '../features/auth/password'
import { m } from '../paraglide/messages.js'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async ({ context }) => {
    if (typeof window === 'undefined') return
    if (await context.queryClient.ensureQueryData(meQuery)) throw redirect({ to: '/' })
  },
  component: SignInPage,
})

type Mode = 'sign-in' | 'sign-up'

function SignInPage() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const tooShort =
    mode === 'sign-up' && password.length > 0 && password.length < MIN_PASSWORD_LENGTH

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (tooShort || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await (mode === 'sign-in' ? signIn(email, password) : signUp(email, password))
      // Drop the cached "signed out" answer so the app layout asks again.
      queryClient.removeQueries({ queryKey: meQuery.queryKey })
      await navigate({ to: '/' })
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 md:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4">
        <form onSubmit={(event) => void submit(event)} className="w-full max-w-sm" noValidate>
          <h1 className="text-xl font-medium">{m.signInTitle({ app: APP_NAME })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{m.signInTagline()}</p>
          <Tabs
            value={mode}
            onValueChange={(value) => {
              setMode(value === 'sign-up' ? 'sign-up' : 'sign-in')
              setError(undefined)
            }}
            className="mt-6"
          >
            <TabsList>
              <TabsTrigger value="sign-in">{m.signIn()}</TabsTrigger>
              <TabsTrigger value="sign-up">{m.signUp()}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="mt-6 flex flex-col gap-4">
            <Input
              label={m.fieldEmail()}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
            />
            <Input
              label={m.fieldPassword()}
              type="password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={setPassword}
              error={tooShort ? m.passwordTooShort({ min: MIN_PASSWORD_LENGTH }) : undefined}
            />
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-6 w-full" disabled={busy || !email || !password}>
            {busy ? m.pleaseWait() : mode === 'sign-in' ? m.signIn() : m.createAccount()}
          </Button>
        </form>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted-foreground">
        {m.signInFooter({ app: APP_NAME })}
      </footer>
    </div>
  )
}
