import { expect, test } from '@playwright/test'

import { logDiaper, onboard, openRow, sheet, sheetClosed, todayRows } from '../support/app'

test('logs a diaper change, deletes it and undoes the delete', async ({ page }) => {
  await onboard(page)
  await logDiaper(page)
  await expect(todayRows(page)).toHaveCount(1)
  // The diaper button now says how long ago instead of "还没有记录".
  await expect(
    page.locator('main').getByRole('button', { name: '尿布', exact: true }),
  ).not.toHaveAccessibleDescription('还没有记录')

  await openRow(page)
  await sheet(page).getByRole('button', { name: '删除' }).click()
  await expect(todayRows(page)).toHaveCount(0)

  const toast = page.locator('[data-sonner-toast]', { hasText: '已删除一条记录' })
  await toast.getByRole('button', { name: '撤销' }).click()
  await expect(todayRows(page)).toHaveCount(1)
})

test('starts and stops a sleep timer', async ({ page }) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '现在开始睡觉' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.getByRole('button', { name: '醒了' }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(todayRows(page)).toHaveCount(1)
})

test('times pumping and asks for the amount when it stops', async ({ page }) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await sheet(page).getByRole('button', { name: '吸奶' }).click()
  await sheet(page).getByRole('button', { name: '开始计时' }).click()
  await sheetClosed(page)
  await expect(page.getByText('吸奶中 · 双侧')).toBeVisible()
  await page.getByRole('button', { name: '结束' }).click()
  await sheet(page)
    .getByLabel(/吸奶量/)
    .fill('80')
  await sheet(page).getByRole('button', { name: '结束' }).click()
  await sheetClosed(page)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(todayRows(page)).toHaveCount(1)
})

test('logs a breastfeed afterwards with minutes on each side', async ({ page }) => {
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  // Left is suggested first; it starts with the usual 10 minutes. Add 5 on the right.
  const right = sheet(page).getByRole('group', { name: '右侧喂了多久' })
  await right.getByText('5 分钟', { exact: true }).click()
  await expect(sheet(page).getByLabel('结束时间')).not.toHaveValue('')
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(page.getByText('左 10 分钟 · 右 5 分钟')).toBeVisible()
})

test('edits a finished record by its start, duration and end', async ({ page }) => {
  // Midday, so the hour before and the shortened sleep both stay on today's list.
  await page.clock.install({ time: new Date('2026-10-27T12:00:00+08:00') })
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  // Logged afterwards: an hour that just ended.
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await openRow(page)
  const end = sheet(page).getByLabel('结束时间')
  const before = await end.inputValue()
  await sheet(page).getByText('30 分钟', { exact: true }).click()
  // A shorter sleep from the same start ends earlier.
  await expect(end).not.toHaveValue(before)
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText('30 分钟')
})

test('logs afterwards the times on the screen, also once the minute has turned', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-27T10:05:20+08:00') })
  await onboard(page)
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await sheet(page).getByText('瓶喂', { exact: true }).click()
  await sheet(page).getByText('120', { exact: true }).click()
  await sheet(page).getByText('1 小时前', { exact: true }).click()
  const end = sheet(page).getByLabel('结束时间')
  await expect(end).toHaveValue(/T09:05$/)
  // The minute turns while the sheet is open: what it shows is what gets saved.
  await page.clock.fastForward(50_000)
  const shown = (await end.inputValue()).slice(-5)
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText(shown)
})
