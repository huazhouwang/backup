import { mkdirSync } from 'node:fs'

import { type Page, devices, test } from '@playwright/test'

import { addManualAccount, signUp } from '../support/app'

/** Saves the key screens for PR comparisons (not a CI check: pixels differ per machine). */
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { ...devices['iPhone 13'], browserName: 'chromium' as const },
}

/** The browser language, e.g. `SCREENSHOT_LOCALE=zh-CN`; screens go to `screenshots/<locale>/`. */
const LOCALE = process.env['SCREENSHOT_LOCALE']
/** Where the app keeps a chosen language (project.inlang/paraglide.config.js). */
const LOCALE_KEY = 'folio-locale'

/** The helpers find elements by their English text: run them in English, then switch back. */
async function inEnglish(page: Page, steps: () => Promise<unknown>) {
  await page.evaluate((key) => localStorage.setItem(key, 'en'), LOCALE_KEY)
  await steps()
  await page.evaluate((key) => localStorage.removeItem(key), LOCALE_KEY)
}

for (const [name, options] of Object.entries(VIEWPORTS)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`${name} ${colorScheme}`, async ({ browser }) => {
      const context = await browser.newContext({
        ...options,
        colorScheme,
        ...(LOCALE ? { locale: LOCALE } : {}),
      })
      const page = await context.newPage()
      const dir = new URL(`../screenshots/${LOCALE ? `${LOCALE}/` : ''}`, import.meta.url).pathname
      mkdirSync(dir, { recursive: true })
      const shot = async (screen: string) => {
        await page.waitForTimeout(800)
        await page.screenshot({ path: `${dir}${screen}-${name}-${colorScheme}.png` })
      }
      await page.goto('/sign-in')
      await shot('sign-in')
      await inEnglish(page, () => signUp(page))
      await page.reload()
      await shot('overview-empty')
      await inEnglish(page, async () => {
        await addManualAccount(page, 'Cold storage', [
          { search: 'bitcoin', symbol: 'BTC', amount: '0.5' },
          { search: 'ethereum', symbol: 'ETH', amount: '2' },
          { search: 'solana', symbol: 'SOL', amount: '40' },
        ])
        await page
          .getByRole('button', { name: /Cold storage/ })
          .getByText('Synced')
          .waitFor()
      })
      for (const [path, screen] of [
        ['/accounts', 'accounts'],
        ['/', 'overview'],
        ['/insights', 'insights'],
        ['/assets/coingecko:bitcoin', 'asset'],
        ['/settings', 'settings'],
      ]) {
        await page.goto(path!)
        await shot(screen!)
      }
      await context.close()
    })
  }
}
