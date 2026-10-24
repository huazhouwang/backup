import { getRouteApi } from '@tanstack/react-router';
import { LoaderIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Logo } from '@/features/site/SiteHeader';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { m } from '@/lib/i18n';
import { MIN_PASSWORD } from '@/lib/password';
import { useMe } from '@/lib/query';
import { useLoginFlow, type Step } from './useLoginFlow';

const route = getRouteApi('/login');

export function LoginPage() {
  const { redirect } = route.useSearch();
  const me = useMe();
  const {
    step,
    setStep,
    go,
    email,
    setEmail,
    password,
    setPassword,
    code,
    setCode,
    busy,
    error,
    sendCode,
    signInCode,
    signIn,
    signUp,
    verify,
    forgot,
    reset,
    google,
  } = useLoginFlow(redirect);
  const guest = me.data?.user?.isAnonymous;

  const submit = (label: string, disabled: boolean) => (
    <Button type="submit" className="w-full" disabled={!!busy || disabled}>
      {busy && <LoaderIcon className="animate-spin" />}
      {busy ?? label}
    </Button>
  );
  const emailField = (
    <Field>
      <FieldLabel htmlFor="email">{m.login_email()}</FieldLabel>
      <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
    </Field>
  );
  const passwordField = (label: string, isNew: boolean) => (
    <Field>
      <FieldLabel htmlFor="password">{label}</FieldLabel>
      <Input
        id="password"
        type="password"
        autoComplete={isNew ? 'new-password' : 'current-password'}
        required
        minLength={isNew ? MIN_PASSWORD : undefined}
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      {isNew && <FieldDescription>{m.login_password_hint({ min: MIN_PASSWORD })}</FieldDescription>}
    </Field>
  );
  const codeField = (hint: React.ReactNode) => (
    <Field>
      <FieldLabel htmlFor="code">{m.login_code()}</FieldLabel>
      <Input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={e => setCode(e.target.value)}
        className="font-mono tracking-widest"
      />
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
  const link = (label: string, s: Step) => (
    <Button type="button" variant="link" className="h-auto p-0" onClick={() => go(s)}>
      {label}
    </Button>
  );
  const pw = step.tab === 'password' ? step.at : null;
  // Production without a mail service: codes can't be delivered, so only email + password (without
  // verification or password reset) and Google are offered
  const mailOff = me.data?.mailEnabled === false;
  useEffect(() => {
    if (mailOff && step.tab === 'code') setStep({ tab: 'password', at: 'sign-in' });
  }, [mailOff]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <Logo />
        <div>
          <h1 className="text-xl font-semibold">{m.login_title()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{guest ? m.login_guest_hint() : mailOff ? null : m.login_auto_create_hint()}</p>
        </div>
        <Tabs value={step.tab} onValueChange={v => go(v === 'code' ? { tab: 'code', at: 'email' } : { tab: 'password', at: 'sign-in' })}>
          {!mailOff && (
            <TabsList className="w-full">
              <TabsTrigger value="code">{m.login_tab_code()}</TabsTrigger>
              <TabsTrigger value="password">{m.login_tab_password()}</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="code" className="pt-4">
            {step.tab === 'code' && step.at === 'email' && (
              <form onSubmit={sendCode} className="space-y-4">
                {emailField}
                {submit(m.login_send_code(), !email)}
              </form>
            )}
            {step.tab === 'code' && step.at === 'code' && (
              <form onSubmit={signInCode} className="space-y-4">
                {codeField(
                  <>
                    {m.login_code_sent({ email })}
                    {link(m.login_change_email(), { tab: 'code', at: 'email' })}
                  </>,
                )}
                {submit(m.login_submit(), code.length < 6)}
              </form>
            )}
          </TabsContent>

          <TabsContent value="password" className="pt-4">
            {pw === 'sign-in' && (
              <form onSubmit={signIn} className="space-y-4">
                {emailField}
                {passwordField(m.login_password(), false)}
                {submit(m.login_submit(), !email || !password)}
                <p className="flex justify-between text-sm text-muted-foreground">
                  {link(m.login_sign_up_link(), { tab: 'password', at: 'sign-up' })}
                  {!mailOff && link(m.login_forgot_link(), { tab: 'password', at: 'forgot' })}
                </p>
              </form>
            )}
            {pw === 'sign-up' && (
              <form onSubmit={signUp} className="space-y-4">
                {emailField}
                {passwordField(m.login_set_password(), true)}
                {submit(m.login_sign_up(), !email || password.length < MIN_PASSWORD)}
                <p className="text-sm text-muted-foreground">
                  {m.login_have_account()}
                  {link(m.login_go_sign_in(), { tab: 'password', at: 'sign-in' })}
                </p>
              </form>
            )}
            {pw === 'verify' && (
              <form onSubmit={verify} className="space-y-4">
                {codeField(
                  <>
                    {m.login_verify_hint_before({ email })}
                    {link(m.login_verify_hint_link(), { tab: 'password', at: 'sign-in' })}
                    {m.login_verify_hint_after()}
                  </>,
                )}
                {submit(m.login_verify_and_sign_in(), code.length < 6)}
              </form>
            )}
            {pw === 'forgot' && (
              <form onSubmit={forgot} className="space-y-4">
                {emailField}
                {submit(m.login_send_code(), !email)}
                <p className="text-sm text-muted-foreground">{link(m.login_back_to_sign_in(), { tab: 'password', at: 'sign-in' })}</p>
              </form>
            )}
            {pw === 'reset' && (
              <form onSubmit={reset} className="space-y-4">
                {codeField(<>{m.login_code_sent({ email })}</>)}
                {passwordField(m.login_new_password(), true)}
                {submit(m.login_reset_and_sign_in(), code.length < 6 || password.length < MIN_PASSWORD)}
              </form>
            )}
          </TabsContent>
        </Tabs>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {me.data?.googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" />
              {m.login_or()}
              <Separator className="flex-1" />
            </div>
            <Button variant="outline" className="w-full" onClick={google}>
              {m.login_google()}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
