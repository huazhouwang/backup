import { Button } from '@lullabo/ui/button'
import { FormError } from '@lullabo/ui/form-error'
import { Input } from '@lullabo/ui/input'
import { SegmentedControl } from '@lullabo/ui/segmented-control'
import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useEffect, useState } from 'react'

import { HttpError } from '../../lib/api'
import { m } from '../../paraglide/messages.js'
import {
  requestPasswordReset,
  resetPassword,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from './account'
import { isPasskeyCancel, passkeysSupported, signInWithPasskey } from './passkey'
import { MIN_PASSWORD_LENGTH } from './password'
import { PasswordRefused, checkNewPassword } from './password-check'
import { accountQueries } from './queries'

type Mode = 'sign-in' | 'sign-up' | 'reset-request' | 'reset'

const RESEND_SECONDS = 60
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isStatus = (error: unknown, status: number) =>
  error instanceof HttpError && error.status === status

/**
 * Google sign-in, or email and password with sign-up and a code-based password reset. Google
 * and the reset show only when the deployment is set up for them. `onSignedIn` runs after an
 * email or passkey sign-in; Google leaves the page and returns to `returnTo`.
 */
export function SignInOptions({
  returnTo,
  onGoogle,
  onSignedIn,
}: {
  returnTo?: string
  /** Runs before leaving for Google, e.g. to remember what to do on return. */
  onGoogle?: () => void
  onSignedIn: () => void | Promise<void>
}) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [resendIn, setResendIn] = useState(0)
  // Until the server answers (or offline), only what needs no setup: email and passkeys.
  const { data: options } = useQuery(accountQueries.signInOptions())
  const google = options?.google === true
  const passkeyButton = mode === 'sign-in' && passkeysSupported()

  useEffect(() => {
    if (resendIn <= 0) return undefined
    const id = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  function switchMode(next: Mode) {
    setMode(next)
    setError(undefined)
    setPassword('')
  }

  async function signInGoogle() {
    setError(undefined)
    onGoogle?.()
    try {
      await signInWithGoogle(returnTo)
    } catch {
      setError(m.signInFailed())
    }
  }

  async function passkey() {
    setError(undefined)
    setBusy(true)
    try {
      await signInWithPasskey()
      await onSignedIn()
    } catch (passkeyError) {
      if (!isPasskeyCancel(passkeyError)) {
        setError(isStatus(passkeyError, 429) ? m.emailTooMany() : m.passkeySignInFailed())
      }
    } finally {
      setBusy(false)
    }
  }

  /** Validates, runs `action` and maps the server's answer to a message. */
  async function run(action: () => Promise<void>, failure: (error: unknown) => string) {
    setError(undefined)
    setBusy(true)
    try {
      await action()
    } catch (actionError) {
      setError(isStatus(actionError, 429) ? m.emailTooMany() : failure(actionError))
    } finally {
      setBusy(false)
    }
  }

  function check({ needsPassword }: { needsPassword: boolean }): boolean {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError(m.emailInvalid())
      return false
    }
    if (needsPassword && password.length < MIN_PASSWORD_LENGTH) {
      setError(m.passwordTooShort({ min: MIN_PASSWORD_LENGTH }))
      return false
    }
    return true
  }

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    if (mode === 'sign-in') {
      if (!check({ needsPassword: true })) return
      void run(
        async () => {
          await signInWithEmail(email, password)
          await onSignedIn()
        },
        (e) => (isStatus(e, 401) ? m.signInWrong() : m.emailSendFailed()),
      )
    } else if (mode === 'sign-up') {
      if (!check({ needsPassword: true })) return
      void run(
        async () => {
          await checkNewPassword(email, password)
          await signUpWithEmail(email, password, name)
          await onSignedIn()
        },
        (e) =>
          e instanceof PasswordRefused
            ? e.message
            : isStatus(e, 422)
              ? m.signUpExists()
              : m.emailSendFailed(),
      )
    } else if (mode === 'reset-request') {
      if (!check({ needsPassword: false })) return
      void run(
        async () => {
          await requestPasswordReset(email)
          setMode('reset')
          setCode('')
          setResendIn(RESEND_SECONDS)
        },
        () => m.emailSendFailed(),
      )
    } else {
      if (!/^\d{6}$/.test(code)) {
        setError(m.emailCodeFormat())
        return
      }
      if (!check({ needsPassword: true })) return
      void run(
        async () => {
          await checkNewPassword(email, password)
          await resetPassword(email, code, password)
          await signInWithEmail(email, password)
          await onSignedIn()
        },
        (e) =>
          e instanceof PasswordRefused
            ? e.message
            : e instanceof HttpError
              ? m.emailCodeInvalid()
              : m.emailSendFailed(),
      )
    }
  }

  const submitLabel = busy
    ? m.signInWorking()
    : mode === 'sign-in'
      ? m.signInSubmit()
      : mode === 'sign-up'
        ? m.signUpSubmit()
        : mode === 'reset-request'
          ? m.emailSendCode()
          : m.resetSubmit()

  return (
    <div className="flex flex-col gap-3">
      {(mode === 'sign-in' || mode === 'sign-up') && (
        <SegmentedControl
          label={m.signInOrUp()}
          options={[
            { value: 'sign-in', label: m.signInSubmit() },
            { value: 'sign-up', label: m.signUpSubmit() },
          ]}
          value={mode}
          onChange={switchMode}
        />
      )}
      {google && (
        <Button size="lg" block onClick={() => void signInGoogle()}>
          {m.signInGoogle()}
        </Button>
      )}
      {passkeyButton && (
        <Button variant="outline" block disabled={busy} onClick={() => void passkey()}>
          {m.passkeySignIn()}
        </Button>
      )}
      {(google || passkeyButton) && (
        <div aria-hidden className="flex items-center gap-3 text-caption text-muted-foreground">
          <span className="h-0.5 flex-1 bg-border" />
          {m.signInOr()}
          <span className="h-0.5 flex-1 bg-border" />
        </div>
      )}
      <form noValidate onSubmit={submit} className="flex flex-col gap-3">
        {mode === 'reset-request' && <p className="m-0 text-muted-foreground">{m.resetIntro()}</p>}
        {mode === 'reset' ? (
          <p className="m-0 text-caption text-muted-foreground">
            {m.resetCodeSent({ email: email.trim() })}
          </p>
        ) : (
          <Input
            label={m.emailLabel()}
            type="email"
            inputMode="email"
            autoComplete={mode === 'sign-up' ? 'email' : 'username'}
            placeholder={m.emailPlaceholder()}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        {mode === 'sign-up' && (
          <Input
            label={m.signUpNickname()}
            autoComplete="nickname"
            placeholder={m.signUpNicknamePlaceholder()}
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {mode === 'reset' && (
          <Input
            label={m.emailCodeLabel()}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="text-center text-title tracking-[0.4em] tabular-nums"
            value={code}
            onChange={(e) => setCode(e.target.value.replaceAll(/\D/g, '').slice(0, 6))}
          />
        )}
        {mode !== 'reset-request' && (
          <Input
            label={mode === 'reset' ? m.passwordNewLabel() : m.passwordLabel()}
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            hint={mode === 'sign-in' ? undefined : m.passwordHint({ min: MIN_PASSWORD_LENGTH })}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <Button type="submit" variant={google ? 'outline' : 'default'} block disabled={busy}>
          {submitLabel}
        </Button>
      </form>
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-wrap justify-between gap-2">
        {mode === 'sign-in' && options?.passwordReset && (
          <Button variant="ghost" onClick={() => switchMode('reset-request')}>
            {m.passwordForgot()}
          </Button>
        )}
        {(mode === 'reset-request' || mode === 'reset') && (
          <Button variant="ghost" onClick={() => switchMode('sign-in')}>
            {m.resetBack()}
          </Button>
        )}
        {mode === 'reset' && (
          <Button
            variant="ghost"
            disabled={busy || resendIn > 0}
            onClick={() =>
              void run(
                async () => {
                  await requestPasswordReset(email)
                  setResendIn(RESEND_SECONDS)
                },
                () => m.emailSendFailed(),
              )
            }
          >
            {resendIn > 0 ? m.emailResendIn({ seconds: resendIn }) : m.emailResend()}
          </Button>
        )}
      </div>
    </div>
  )
}
