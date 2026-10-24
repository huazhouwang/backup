/** Send OTP emails: Resend in production; printed to the terminal locally when not configured. */
import { env } from 'cloudflare:workers';
import { m } from '@/lib/i18n';

export type OtpType = 'sign-in' | 'email-verification' | 'forget-password' | 'change-email';

// Looked up when the mail is sent, so the email is in the language of the request that asked for the code
const PURPOSE: Record<OtpType, () => string> = {
  'sign-in': m.server_mail_purpose_sign_in,
  'email-verification': m.server_mail_purpose_email_verification,
  'forget-password': m.server_mail_purpose_forget_password,
  'change-email': m.server_mail_purpose_change_email,
};

/** Email sign-in is available when Resend is configured, or always in local development (codes go to the terminal). */
export const mailEnabled = () => !!(env.RESEND_API_KEY && env.MAIL_FROM) || import.meta.env.DEV;

export async function sendOtpMail(email: string, otp: string, type: OtpType = 'sign-in') {
  const purpose = (PURPOSE[type] ?? PURPOSE['sign-in'])();
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    // Never pretend a code was sent in production
    if (!import.meta.env.DEV) throw new Error(m.server_err_mail_not_configured());
    console.log(`[dev] OTP for ${email}: ${otp} (${type})`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: m.server_mail_subject({ purpose, otp }),
      text: m.server_mail_body({ purpose, otp }),
    }),
  });
  if (!res.ok) throw new Error(m.server_err_mail_send_failed({ status: res.status }));
}
