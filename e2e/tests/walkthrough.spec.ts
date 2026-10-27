import { expect, test } from '@playwright/test'

import { logDiaper, onboard, openRow, sheet, sheetClosed, todayRows } from '../support/app'

// Problems found walking through the whole app.

test('a new badge is celebrated for a few seconds, then out of the way for good', async ({
  page,
}) => {
  await page.clock.install()
  await onboard(page)
  await logDiaper(page)
  const toast = page.locator('[data-sonner-toast]', { hasText: '获得新徽章' })
  await expect(toast).toBeVisible()
  await page.clock.runFor(7000)
  await expect(toast).toHaveCount(0)
  // Seen: not again on the next visit.
  await page.reload()
  await expect(page.getByText('今天的记录')).toBeVisible()
  await page.clock.runFor(1000)
  await expect(toast).toHaveCount(0)
})

test('saving a record opened but not changed keeps its times', async ({ page }) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '现在开始睡觉' }).click()
  await sheetClosed(page)
  await page.getByRole('button', { name: '醒了' }).click()
  await expect(todayRows(page).first()).toContainText('不到 1 分钟')
  await openRow(page)
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText('不到 1 分钟')
  // Just woke: not "醒了 0 分钟".
  await expect(
    page.locator('main').getByRole('button', { name: '睡眠', exact: true }),
  ).toContainText('刚醒')
})

test('the welcome page offers signing in, and no microphone yet', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('欢迎来到 Lullabo')).toBeVisible()
  await expect(page.getByRole('button', { name: '语音', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: '已有账号？登录后接着记录' }).click()
  await expect(page).toHaveURL(/\/settings\/account$/)
})

test('the microphone, signed out, says on the sign-in page why it went there', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: '语音', exact: true }).click()
  await expect(page).toHaveURL(/\/settings\/account\?from=mic$/)
  await expect(page.getByText('登录后，就能用麦克风记录和提问。')).toBeVisible()
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
})
