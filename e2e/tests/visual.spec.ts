import { type Page, expect, test } from '@playwright/test'

import { logDiaper, onboard, sheet, sheetClosed, signIn, syncNow } from '../support/app'

// Still screens: fixed clock, no motion, no toasts (they come and go on their own timers).
test.use({ contextOptions: { reducedMotion: 'reduce' } })

const screen = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true })
const sheetShot = async (page: Page, name: string) => {
  await page.waitForTimeout(300)
  await expect(sheet(page)).toHaveScreenshot(`${name}.png`)
}
const closeSheet = async (page: Page) => {
  await page.keyboard.press('Escape')
  await sheetClosed(page)
}

async function addBaby(page: Page, name: string) {
  await page.locator('main button').first().click()
  await sheet(page).getByRole('button', { name: '添加宝宝' }).click()
  await sheet(page)
    .getByLabel(/名字/)
    .fill(name)
  await sheet(page).locator('button[type=submit]').click()
  await sheetClosed(page)
}

test('key screens look as before', async ({ page, context }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+08:00'))
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = '[data-sonner-toaster] { display: none !important; }'
    document.addEventListener('DOMContentLoaded', () => document.head.append(style))
  })

  await onboard(page)
  await logDiaper(page)
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '现在开始睡觉' }).click()
  await sheetClosed(page)
  await addBaby(page, '老二')
  await addBaby(page, '老三')
  await page.locator('main button').first().click()
  await sheet(page)
    .getByRole('button', { name: /小米粒/ })
    .click()
  await sheetClosed(page)
  await screen(page, 'today')

  await page.getByRole('button', { name: '前一天' }).click()
  await screen(page, 'yesterday')
  await page.getByRole('button', { name: '回到今天' }).click()

  await page.goto('/stats?view=trends')
  await expect(page.getByText('喂养次数')).toBeVisible()
  await screen(page, 'trends')
  await page.goto('/stats?view=growth')
  await expect(page.getByText('体重生长曲线')).toBeVisible()
  await screen(page, 'growth')
  await page.goto('/')

  await page.locator('main button').first().click()
  await sheetShot(page, 'switcher')
  await closeSheet(page)

  await page.goto('/settings/babies')
  await page
    .locator('main')
    .getByRole('button', { name: /老三/ })
    .click()
  await sheet(page).getByRole('button', { name: '归档' }).click()
  await sheetClosed(page)
  await screen(page, 'babies')
  await page
    .locator('main')
    .getByRole('button', { name: /小米粒/ })
    .click()
  await sheet(page).getByRole('button', { name: '删除宝宝' }).click()
  await sheetShot(page, 'delete-baby')
  await closeSheet(page)

  await page.goto('/settings/export')
  await expect(page.getByText('全部宝宝')).toBeVisible()
  await screen(page, 'export')
  await page
    .locator('main')
    .getByRole('button', { name: /全部宝宝/ })
    .click()
  await sheetShot(page, 'export-picker')
  await closeSheet(page)

  // The local server has no Google client or email: only email and passkeys.
  await page.goto('/settings/account')
  await expect(page.getByRole('radio', { name: '登录' })).toBeChecked()
  await page.waitForLoadState('networkidle')
  await screen(page, 'account-signed-out')

  await signIn(context, 'visual')
  await syncNow(page)
  // The sync time would change on every run.
  const syncTime = page.getByText(/^已同步 · /)
  await expect(page.getByText('visual@example.com')).toBeVisible()
  await expect(page).toHaveScreenshot('account.png', { fullPage: true, mask: [syncTime] })
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '家庭' })).toBeVisible()
  await expect(syncTime).toBeVisible()
  // The sync time, and the build id and date in the about row, change on every run.
  await expect(page).toHaveScreenshot('settings.png', {
    fullPage: true,
    mask: [syncTime, page.getByText(/^版本 /)],
  })
  await page.getByRole('link', { name: /的家/ }).click()
  await expect(page.getByRole('button', { name: '邀请家人' })).toBeVisible()
  await screen(page, 'family')
  await page.getByRole('button', { name: '删除家庭' }).click()
  await sheetShot(page, 'delete-family')
  await closeSheet(page)

  await page.goto('/settings/about')
  await expect(page.getByRole('button', { name: '检查更新' })).toBeVisible()
  // The build id and date differ per build.
  await expect(page).toHaveScreenshot('about.png', {
    fullPage: true,
    mask: [page.getByText(/^版本 /)],
  })
})
