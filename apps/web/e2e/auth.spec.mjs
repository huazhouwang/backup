// E2E: email+password sign-up (verify email with OTP) → sign out → password sign-in → wrong password → forgot-password reset → raw password never sent to the server

import { test } from '@playwright/test';
import { BASE, check, devLog } from './support.mjs';

test('auth', async ({ browser: b }) => {
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Dev log line: "[dev] OTP for <email>: <6 digits> (<type>)", type is sign-in | email-verification | forget-password | change-email
  const otpOf = async (email, type) => {
    const re = new RegExp(`\\[dev\\] OTP for ${escapeRe(email)}: (\\d{6}) \\(${escapeRe(type)}\\)`, 'g');
    for (let i = 0; i < 20; i++) {
      const m = [...devLog().matchAll(re)].at(-1);
      if (m) return m[1];
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`No ${type} OTP received for ${email}`);
  };

  const p = await (await b.newContext()).newPage();
  const SECRET = 'correct horse battery 9';
  const NEW_SECRET = 'another horse staple 7';
  const leaked = [];
  p.on('request', r => {
    const body = r.postData() ?? '';
    if (body.includes(SECRET) || body.includes(NEW_SECRET)) leaked.push(r.url());
  });
  const me = () => p.evaluate(async () => (await (await fetch('/api/me')).json()).user);
  const signOut = () => p.evaluate(() => fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));

  // Sign-in endpoints are limited to 10 requests per IP per minute; earlier tests used some, so wait one window first
  await new Promise(r => setTimeout(r, 61000));

  // Create a project as a guest first
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: '从零开始' }).click();
  await p.waitForURL(/\/p\//);
  const guestProject = p.url().match(/\/p\/([^/?]+)/)[1];

  // Sign up
  const email = `pw${Date.now()}@example.com`;
  await p.goto(`${BASE}/login`);
  await p.getByRole('tab', { name: '密码' }).click();
  await p.getByRole('button', { name: '注册新账号' }).click();
  await p.getByLabel('邮箱').fill(email);
  await p.getByLabel('设置密码').fill(SECRET);
  await p.getByRole('button', { name: '注册' }).click();
  await p.locator('input#code').waitFor({ timeout: 20000 });
  check(true, 'sign-up asks for an OTP to verify the email');
  await p.locator('input#code').fill(await otpOf(email, 'email-verification'));
  await p.getByRole('button', { name: '验证并登录' }).click();
  await p.waitForURL(/\/projects/);
  let u = await me();
  check(u.email === email && !u.isAnonymous, `signed in after verification: ${u.email}`);
  const mine = await p.evaluate(async () => (await (await fetch('/api/projects')).json()).map(x => x.id));
  check(mine.includes(guestProject), 'guest project moved to the new account');

  // Sign out, then sign in with password; wrong password shows an error
  await signOut();
  await p.goto(`${BASE}/login`);
  await p.getByRole('tab', { name: '密码' }).click();
  await p.getByLabel('邮箱').fill(email);
  await p.locator('input#password').fill('wrong password 1');
  await p.getByRole('button', { name: '登录', exact: true }).click();
  check(
    await p
      .getByRole('alert')
      .filter({ hasText: '邮箱或密码不对' })
      .waitFor({ timeout: 20000 })
      .then(
        () => true,
        () => false,
      ),
    'wrong password: shows the invalid-credentials alert',
  );
  await p.locator('input#password').fill(SECRET);
  await p.getByRole('button', { name: '登录', exact: true }).click();
  await p.waitForURL(/\/projects/);
  check((await me()).email === email, 'password sign-in succeeds');

  // Forgot password: OTP + new password
  await signOut();
  await p.goto(`${BASE}/login`);
  await p.getByRole('tab', { name: '密码' }).click();
  await p.getByRole('button', { name: '忘记密码' }).click();
  await p.getByLabel('邮箱').fill(email);
  await p.getByRole('button', { name: '发送验证码' }).click();
  await p.locator('input#code').waitFor({ timeout: 20000 });
  await p.locator('input#code').fill(await otpOf(email, 'forget-password'));
  await p.getByLabel('新密码').fill(NEW_SECRET);
  await p.getByRole('button', { name: '重设并登录' }).click();
  await p.waitForURL(/\/projects/);
  check((await me()).email === email, 'signed in automatically after password reset');
  await signOut();
  const old = await p.evaluate(
    async ([e, pw]) => {
      const { derivePassword } = await import('/src/lib/password.ts');
      const r = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, password: await derivePassword(e, pw) }),
      });
      return r.status;
    },
    [email, SECRET],
  );
  check(old === 401, `old password rejected (${old})`);

  // An account that only ever signed in with an OTP can also set a password via "forgot password"
  // Sign-in endpoints are limited to 10 per IP per minute and we've used nearly 10 above: wait out this minute
  await new Promise(r => setTimeout(r, 61000));
  const otpUser = `otp${Date.now()}@example.com`;
  await p.goto(`${BASE}/login`);
  await p.getByLabel('邮箱').fill(otpUser);
  await p.getByRole('button', { name: '发送验证码' }).click();
  await p.locator('input#code').fill(await otpOf(otpUser, 'sign-in'));
  await p.getByRole('button', { name: '登录', exact: true }).click();
  await p.waitForURL(/\/projects/);
  await signOut();
  await p.goto(`${BASE}/login`);
  await p.getByRole('tab', { name: '密码' }).click();
  await p.getByRole('button', { name: '忘记密码' }).click();
  await p.getByLabel('邮箱').fill(otpUser);
  await p.getByRole('button', { name: '发送验证码' }).click();
  await p.locator('input#code').fill(await otpOf(otpUser, 'forget-password'));
  await p.getByLabel('新密码').fill(NEW_SECRET);
  await p.getByRole('button', { name: '重设并登录' }).click();
  await p.waitForURL(/\/projects/);
  check((await me()).email === otpUser, 'OTP-only account set a password and signed in');

  check(leaked.length === 0, leaked.length ? `raw password sent to: ${leaked.join(', ')}` : 'raw password never sent to the server');
});
