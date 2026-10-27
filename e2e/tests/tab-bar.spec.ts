import { expect, test } from '@playwright/test'

import { onboard } from '../support/app'

for (const path of ['/', '/stats', '/tips', '/settings']) {
  test(`the microphone covers nothing at the end of ${path}`, async ({ page }) => {
    await onboard(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(300)
    const { contentBottom, micTop } = await page.evaluate(() => {
      const main = document.querySelector('main')!
      const bottoms = [...main.querySelectorAll('*')]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.height > 0)
        .map((rect) => rect.bottom)
      // The microphone with the tab bar's bulge around it.
      const mic = document.querySelector('nav button')!.parentElement!.firstElementChild!
      return {
        contentBottom: Math.max(...bottoms),
        micTop: mic.getBoundingClientRect().top,
      }
    })
    expect(contentBottom).toBeLessThanOrEqual(micTop)
  })
}
