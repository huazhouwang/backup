import { expect, test } from '@playwright/test'

import { onboard } from '../support/app'

test('the Tips tab shows what to expect at the baby’s age, and a tip in full', async ({ page }) => {
  await onboard(page)
  await page.getByRole('navigation').getByRole('link', { name: '贴士' }).click()
  await expect(page).toHaveURL(/\/tips/)
  await expect(page.getByRole('heading', { name: '贴士', level: 1 })).toBeVisible()
  // Born today: the first week, with the newborn's tips and when to see a doctor.
  await expect(page.getByRole('radio', { name: '第 1 周' })).toBeChecked()
  await expect(page.getByText('大部分时间都在睡')).toBeVisible()
  await expect(page.getByText('遇到这些，带宝宝问问医生')).toBeVisible()
  // Signed out: no observation; the records need more days first.
  await expect(page.getByText('Bobo 的观察')).toHaveCount(0)
  await expect(page.getByText('多记几天，这里会把宝宝的记录')).toBeVisible()

  // Another stage, from the chips.
  await page.getByText('4 个月', { exact: true }).click()
  await expect(page.getByText('趴着能抬头看四周')).toBeVisible()
  await expect(page.getByText('根据你的记录')).toHaveCount(0)

  await page.getByRole('link', { name: /4 个月睡眠倒退/ }).click()
  await expect(page.getByRole('heading', { name: '4 个月睡眠倒退' })).toBeVisible()
  await expect(page.getByText('可以怎么做')).toBeVisible()
  await page.getByRole('link', { name: '贴士' }).first().click()
  await expect(page).toHaveURL(/\/tips/)
})
