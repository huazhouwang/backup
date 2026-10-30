import { expect, test } from '@playwright/test'

import { signIn } from '../support/app'

test('the evening summaries can be turned off, each on its own', async ({ context, page }) => {
  await signIn(context, 'summaries')
  // This device has notifications on: a subscription is there (no push service here).
  await page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.example.com/e2e',
      toJSON: () => ({
        endpoint: 'https://push.example.com/e2e',
        keys: { p256dh: 'a', auth: 'b' },
      }),
      unsubscribe: async () => true,
    }
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' })
    const registration = { pushManager: { getSubscription: async () => subscription } }
    Object.defineProperty(navigator.serviceWorker, 'getRegistration', {
      value: async () => registration,
    })
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      get: () => Promise.resolve(registration),
    })
  })
  await page.route('**/api/push/subscription', (route) => route.fulfill({ status: 204 }))
  await page.goto('/settings/reminders')

  const daily = page.getByRole('group', { name: '每日小结' })
  const weekly = page.getByRole('group', { name: '每周小结' })
  await expect(daily.getByRole('button', { name: '开' })).toHaveAttribute('aria-pressed', 'true')
  await daily.getByRole('button', { name: '关' }).click()
  await expect(daily.getByRole('button', { name: '关' })).toHaveAttribute('aria-pressed', 'true')

  // Kept on the server: still off after a reload, the weekly one still on.
  await page.reload()
  await expect(daily.getByRole('button', { name: '关' })).toHaveAttribute('aria-pressed', 'true')
  await expect(weekly.getByRole('button', { name: '开' })).toHaveAttribute('aria-pressed', 'true')
})
