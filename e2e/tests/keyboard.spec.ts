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

test('a field stays above the keyboard as it rises, though iOS says so only once', async ({
  page,
}) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await sheet(page).getByText('瓶喂', { exact: true }).click()
  const amount = sheet(page).getByLabel('奶量（毫升）')
  await amount.focus()
  // As on an iPhone: one resize as the keyboard starts up, then it keeps rising to its full
  // height over a few hundred milliseconds with no further word to the page.
  await page.evaluate(() => {
    const viewport = window.visualViewport!
    const start = performance.now()
    const covered = () => Math.min(300, 80 + ((performance.now() - start) / 400) * 220)
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => window.innerHeight - covered(),
    })
    viewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(700)
  const { fieldBottom, keyboardTop } = await amount.evaluate((field) => ({
    fieldBottom: field.getBoundingClientRect().bottom,
    keyboardTop: window.visualViewport!.offsetTop + window.visualViewport!.height,
  }))
  expect(fieldBottom).toBeLessThanOrEqual(keyboardTop - 50)
})
