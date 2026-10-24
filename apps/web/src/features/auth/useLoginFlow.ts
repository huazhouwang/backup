import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { m } from '@/lib/i18n';
import { derivePassword } from '@/lib/password';
import { queryClient } from '@/lib/query';

/**
 * Two sign-in methods:
 * - Code: enter email and receive a code; an account is created if none exists
 * - Password: after sign-up the email is verified with a code; forgotten passwords are reset with a code too
 */
export type Step = { tab: 'code'; at: 'email' | 'code' } | { tab: 'password'; at: 'sign-in' | 'sign-up' | 'verify' | 'forgot' | 'reset' };

const MESSAGE: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.login_error_invalid_credentials,
  INVALID_OTP: m.login_error_invalid_otp,
  OTP_EXPIRED: m.login_error_otp_expired,
  TOO_MANY_ATTEMPTS: m.login_error_too_many_attempts,
  USER_ALREADY_EXISTS: m.login_error_user_exists,
};
const message = (e: { code?: string; message?: string; status?: number }, fallback: string) =>
  (e.code && MESSAGE[e.code]?.()) || (e.status === 429 ? m.login_error_rate_limited() : e.message) || fallback;

/** The sign-in flow's state and its steps, each run with a busy label and its error shown on failure */
export function useLoginFlow(redirect: string | undefined) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ tab: 'code', at: 'email' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    await queryClient.invalidateQueries();
    await navigate({ to: redirect?.startsWith('/') ? redirect : '/projects' });
  };

  /** Run a step: show spinner, clear error, show the reason on failure */
  const run =
    (label: string, fn: () => Promise<{ error?: { code?: string; message?: string; status?: number } | null } | void>, fallback: string) =>
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(label);
      setError(null);
      try {
        const r = await fn();
        if (r?.error) setError(message(r.error, fallback));
      } finally {
        setBusy(null);
      }
    };
  const go = (s: Step) => {
    setError(null);
    setCode('');
    setStep(s);
  };

  // Code sign-in
  const sendCode = run(
    m.login_busy_sending(),
    async () => {
      const r = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (!r.error) go({ tab: 'code', at: 'code' });
      return r;
    },
    m.login_send_failed(),
  );
  const signInCode = run(
    m.login_busy_signing_in(),
    async () => {
      const r = await authClient.signIn.emailOtp({ email, otp: code.trim() });
      if (!r.error) await done();
      return r;
    },
    m.login_sign_in_failed(),
  );

  // Password sign-in: slow hashing runs on device and takes a few hundred ms
  const signIn = run(
    m.login_busy_hashing(),
    async () => {
      const r = await authClient.signIn.email({ email, password: await derivePassword(email, password) });
      if (r.error?.code === 'EMAIL_NOT_VERIFIED') {
        go({ tab: 'password', at: 'verify' });
        return;
      }
      if (!r.error) await done();
      return r;
    },
    m.login_sign_in_failed(),
  );
  const signUp = run(
    m.login_busy_hashing(),
    async () => {
      const r = await authClient.signUp.email({ email, password: await derivePassword(email, password), name: email.split('@')[0] });
      if (r.error) return r;
      // Without a mail service there is no verification step: sign-up returns a session right away
      if (r.data?.token) await done();
      else go({ tab: 'password', at: 'verify' });
      return r;
    },
    m.login_sign_up_failed(),
  );
  const verify = run(
    m.login_busy_verifying(),
    async () => {
      const r = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() });
      if (!r.error) await done();
      return r;
    },
    m.login_verify_failed(),
  );
  const forgot = run(
    m.login_busy_sending(),
    async () => {
      const r = await authClient.emailOtp.requestPasswordReset({ email });
      if (!r.error) go({ tab: 'password', at: 'reset' });
      return r;
    },
    m.login_send_failed(),
  );
  const reset = run(
    m.login_busy_hashing(),
    async () => {
      const derived = await derivePassword(email, password);
      const r = await authClient.emailOtp.resetPassword({ email, otp: code.trim(), password: derived });
      if (r.error) return r;
      const s = await authClient.signIn.email({ email, password: derived });
      if (!s.error) await done();
      return s;
    },
    m.login_reset_failed(),
  );

  const google = () => authClient.signIn.social({ provider: 'google', callbackURL: redirect?.startsWith('/') ? redirect : '/projects' });
  return {
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
  };
}
