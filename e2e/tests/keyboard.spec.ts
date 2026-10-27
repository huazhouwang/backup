import { type Page, expect, test } from '@playwright/test'

import { onboard, sheet } from '../support/app'

/** Lays a keyboard over the bottom `height` px, as iOS does: only the visual viewport shrinks. */
async function raiseKeyboard(page: Page, height: number) {
  await page.evaluate((covered) => {
    const viewport = window.visualViewport!
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => window.innerHeight - covered,
    })
    viewport.dispatchEvent(new Event('resize'))
  }, height)
}

test('a field typed in stays above the keyboard and its toolbar', async ({ page }) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await sheet(page).getByText('瓶喂', { exact: true }).click()
  const amount = sheet(page).getByLabel('奶量（毫升）')
  await amount.focus()
  // An iPhone's number pad: about 300px, the toolbar floating above it not counted.
  await raiseKeyboard(page, 300)
  await page.waitForTimeout(300)
  const { fieldBottom, keyboardTop } = await amount.evaluate((field) => ({
    fieldBottom: field.getBoundingClientRect().bottom,
    keyboardTop: window.visualViewport!.offsetTop + window.visualViewport!.height,
  }))
  // The toolbar takes about 50px above the keyboard.
  expect(fieldBottom).toBeLessThanOrEqual(keyboardTop - 50)
})
