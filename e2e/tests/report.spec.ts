import { expect, test } from '@playwright/test'

import { logDiaper, onboard, sheet, sheetClosed } from '../support/app'

declare global {
  interface Window {
    /** Called in place of printing. */
    printed: () => void
  }
}

test('the doctor’s report sums up the days, the fever first, ready to print', async ({ page }) => {
  await onboard(page)
  await logDiaper(page)
  // A fever, logged like any record.
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await sheet(page).getByRole('button', { name: '体温', exact: true }).click()
  await sheet(page)
    .getByLabel(/体温/)
    .fill('38.6')
  await sheet(page).getByRole('button', { name: '记录' }).click()
  await sheetClosed(page)

  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await sheet(page).getByRole('link', { name: '医生报告' }).click()
  await expect(page.getByRole('heading', { name: '给医生看的报告' })).toBeVisible()
  const report = page.locator('article')
  await expect(report).toContainText('小米粒的情况报告')
  await expect(report).toContainText('共 7 天，其中 1 天有记录')
  await expect(report).toContainText('发烧 1 次，最高 38.6 °C')
  await expect(report.getByRole('row')).toHaveCount(8)

  // A longer period, kept in the address for sharing the same view.
  await page.getByText('最近 30 天', { exact: true }).click()
  await expect(report).toContainText('共 30 天')
  await expect(page).toHaveURL(/days=30/)

  // Printing leaves the controls and the tab bar off the paper.
  let printed = false
  await page.exposeFunction('printed', () => {
    printed = true
  })
  await page.evaluate(() => {
    window.print = () => window.printed()
  })
  await page.getByRole('button', { name: '打印 / 存为 PDF' }).click()
  await expect.poll(() => printed).toBe(true)
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('button', { name: '打印 / 存为 PDF' })).toBeHidden()
  await expect(page.getByRole('navigation')).toBeHidden()
  await expect(page.locator('[data-sonner-toaster]')).toBeHidden()
  await expect(report).toBeVisible()
})
