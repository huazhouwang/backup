import type { Env } from './env'

export interface OutgoingEmail {
  to: string
  subject: string
  text: string
  html: string
}

/** The structured `send()` of a Cloudflare Email Service binding (Workers Paid plan). */
export interface EmailBinding {
  send(
    message: OutgoingEmail & { from: string | { email: string; name?: string } },
  ): Promise<unknown>
}

/** Whether email can really be sent; without a way, messages are only logged. */
export const canSendEmail = (env: Env) => Boolean(env.EMAIL || env.RESEND_API_KEY)

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Sends through Cloudflare Email Service when the `EMAIL` binding exists, otherwise through
 * Resend's HTTP API (works on the free plan). Without either, as in local development, the
 * message is only logged.
 */
export async function sendEmail(env: Env, email: OutgoingEmail): Promise<void> {
  const from = env.EMAIL_FROM ?? 'Bobo <noreply@example.com>'
  if (env.EMAIL) {
    await env.EMAIL.send({ ...email, from })
    return
  }
  if (env.RESEND_API_KEY) {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    })
    if (!res.ok) throw new Error(`Resend responded ${res.status}`)
    return
  }
  console.log(`[email] to=${email.to} subject=${email.subject}\n${email.text}`)
}

/** The password reset code email. The UI is Chinese-only for now (#37 adds English). */
export function passwordResetEmail(to: string, code: string, minutes: number): OutgoingEmail {
  return {
    to,
    subject: `Bobo 重置密码验证码：${code}`,
    text: `你正在重置 Bobo 的登录密码，验证码是 ${code}，${minutes} 分钟内有效。\n\n如果不是你本人操作，请忽略这封邮件，你的密码不会改变。`,
    html: `<div style="font-family:sans-serif;font-size:16px;color:#3c3c3c">
<p>你正在重置 Bobo 的登录密码，验证码是：</p>
<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#4152b8">${code}</p>
<p>${minutes} 分钟内有效。如果不是你本人操作，请忽略这封邮件，你的密码不会改变。</p>
</div>`,
  }
}
