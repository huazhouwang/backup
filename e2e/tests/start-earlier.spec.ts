import { expect, test } from '@playwright/test'

import { onboard, sheet, sheetClosed } from '../support/app'

test('a timer can start a few minutes back, and its start be put right later', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T20:00:00+08:00') })
  await onboard(page)

  // The nap began ten minutes before anyone tapped.
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  // The minutes ago fold away behind the last choice (5 at first): a tap opens them below.
  await sheet(page).getByRole('button', { name: '更早开始，上次是 5 分钟前' }).click()
  await page.getByRole('menuitem', { name: '10 分钟前开始' }).click()
  await sheetClosed(page)
  await expect(page.getByRole('timer')).toHaveText(/^10:\d\d$/)
  await expect(page.getByRole('button', { name: '19:50 开始' })).toBeVisible()

  // It was even earlier: the start time on the card opens the record to change it.
  await page.getByRole('button', { name: '19:50 开始' }).click()
  await sheet(page).getByLabel('开始时间').fill('2026-10-27T19:30')
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(page.getByRole('button', { name: '19:30 开始' })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^30:\d\d$/)

  // The last choice shows first next time, for any timer.
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await expect(
    sheet(page).getByRole('button', { name: '更早开始，上次是 10 分钟前' }),
  ).toBeVisible()
})

test('a timer started back into a logged sleep says so instead', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T20:00:00+08:00') })
  await onboard(page)

  // A nap ended five minutes ago: starting fifteen minutes back would overlap it.
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByText('5 分钟前', { exact: true }).click()
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)

  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '更早开始，上次是 5 分钟前' }).click()
  await page.getByRole('menuitem', { name: '15 分钟前开始' }).click()
  await expect(sheet(page).getByText(/重叠/)).toBeVisible()
  await expect(page.getByRole('timer')).toHaveCount(0)
})
