import { expect, test } from '@playwright/test'

import { onboard } from '../support/app'

test('settings saved when the app was called Bobo carry over', async ({ page }) => {
  await onboard(page)
  // As a browser still holding the old keys would have them.
  await page.evaluate(() => {
    localStorage.setItem('bobo.theme', 'dark')
    localStorage.removeItem('lullabo.theme')
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.evaluate(() => [
      localStorage.getItem('lullabo.theme'),
      localStorage.getItem('bobo.theme'),
    ]),
  ).toEqual(['dark', null])
})
