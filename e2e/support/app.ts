import { type Browser, type BrowserContext, type Page, devices, expect } from '@playwright/test'

import { BASE_URL, SECRET, SESSIONS } from './env.mjs'

type SessionKey = (typeof SESSIONS)[number]['key']

/** Better Auth's signed session cookie for a seeded session. */
async function sessionCookie(token: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token))
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
  return encodeURIComponent(`${token}.${encoded}`)
}

/** Signs the browser context in as one of the seeded sessions. */
export async function signIn(context: BrowserContext, who: SessionKey) {
  const session = SESSIONS.find((s) => s.key === who)
  if (!session) throw new Error(`unknown session ${who}`)
  await context.addCookies([
    { name: 'better-auth.session_token', value: await sessionCookie(session.token), url: BASE_URL },
  ])
}

/**
 * Another device: a fresh context with the same phone, locale and base URL as the
 * project's own (contexts made from `browser` don't inherit the config's `use`).
 */
export async function newDevice(browser: Browser) {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: BASE_URL,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  return { context, page: await context.newPage() }
}

/** The open bottom sheet. */
export const sheet = (page: Page) => page.locator('[data-slot=sheet]')

/** Waits for a sheet to finish sliding away. */
export async function sheetClosed(page: Page) {
  await expect(sheet(page)).toHaveCount(0)
}

/** Adds the first baby through onboarding and lands on the today page. */
export async function onboard(page: Page, name = '小米粒') {
  await page.goto('/')
  await expect(page.getByText('欢迎来到 Lullabo')).toBeVisible()
  await page.locator('input:not([type=date]):not([type=radio])').first().fill(name)
  await page.locator('button[type=submit]').click()
  await expect(page.getByText('今天的记录')).toBeVisible()
}

/** Logs a diaper change with the defaults. */
export async function logDiaper(page: Page) {
  await page.locator('main').getByRole('button', { name: '尿布', exact: true }).click()
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
}

/**
 * Opens a row of the today list. A toast (a new badge, undo) can sit over the last rows on
 * a phone-sized screen, so the tap goes to the row itself rather than whatever is on top.
 */
export const openRow = (page: Page, index = 0) => todayRows(page).nth(index).dispatchEvent('click')

/** The rows of the today list. */
export const todayRows = (page: Page) => page.getByRole('button', { name: /^编辑 .* 的/ })

/** Runs a sync from the account page and waits for it to finish. */
export async function syncNow(page: Page) {
  await page.goto('/settings/account')
  await page.getByRole('button', { name: '立即同步' }).click()
  // "已同步" may still show from an earlier sync; nothing left to upload means this one ran.
  await expect(page.getByText(/已同步/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/条改动待上传/)).toHaveCount(0, { timeout: 15_000 })
}
