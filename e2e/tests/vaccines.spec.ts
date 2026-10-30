import { type Page, expect, test } from '@playwright/test'

import { sheet, sheetClosed } from '../support/app'

/** A baby born on 20 May, seen on 29 October: five months old, with doses behind and ahead. */
async function onboardBornInMay(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+08:00'))
  await page.goto('/')
  await expect(page.getByText('欢迎来到 Lullabo')).toBeVisible()
  await page.locator('input:not([type=date]):not([type=radio])').first().fill('小米粒')
  await page.locator('input[type=date]').first().fill('2026-05-20')
  await page.locator('button[type=submit]').click()
  await expect(page.getByText('今天的记录')).toBeVisible()
}

async function openVaccines(page: Page) {
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await sheet(page).getByRole('link', { name: '疫苗' }).click()
  await expect(page.getByRole('heading', { name: '疫苗接种' })).toBeVisible()
}

test('vaccinations catch up in one tap, then are recorded dose by dose', async ({ page }) => {
  await onboardBornInMay(page)
  await openVaccines(page)

  // Starting out, the doses already past are offered as given on time.
  await expect(page.getByText('之前的疫苗都按时打了吗？')).toBeVisible()
  await page.getByRole('button', { name: '都按时打了' }).click()
  await expect(page.getByText('之前的疫苗都按时打了吗？')).toHaveCount(0)
  // Six months old on 20 November: the next doses are coming.
  await expect(page.getByText('下一针')).toBeVisible()
  await expect(page.getByText(/已打 \d+ 剂/)).toBeVisible()

  // The next dose, recorded today with how the baby took it.
  const next =
    (await page
      .locator('main')
      .getByText(/第 \d 剂$/)
      .first()
      .textContent()) ?? ''
  await page.getByRole('button', { name: '记录接种' }).click()
  await sheet(page).getByRole('button', { name: '发烧' }).click()
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)

  // It is a record of the day like any other.
  await page.getByRole('link', { name: '今天' }).first().click()
  const row = page.getByRole('button', { name: /^编辑 .* 的疫苗/ })
  await expect(row).toContainText(next.trim())
  await expect(row).toContainText('发烧')
})

test('the family’s plan picks the kind and the self-paid vaccines', async ({ page }) => {
  await onboardBornInMay(page)
  await openVaccines(page)
  await page.getByRole('button', { name: '我自己记' }).click()

  // Nothing self-paid until chosen; the five-in-one stands in for DTaP and IPV doses.
  await expect(page.getByText('13 价肺炎疫苗 第 1 剂')).toHaveCount(0)
  await page.getByRole('button', { name: '五联疫苗', exact: true }).click()
  await page.getByRole('button', { name: '13 价肺炎疫苗', exact: true }).click()
  await expect(page.getByText('13 价肺炎疫苗 第 1 剂')).toBeVisible()
  // Kept for the baby: still there after reopening the app.
  await page.reload()
  await expect(page.getByRole('button', { name: '五联疫苗', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a family living abroad follows that country’s schedule', async ({ page }) => {
  await onboardBornInMay(page)
  await openVaccines(page)
  await page.getByRole('button', { name: '我自己记' }).click()

  // China's by default here; the UK's, once chosen, with its own vaccines.
  await expect(page.getByText(/^乙肝疫苗 第 \d 剂$/).first()).toBeAttached()
  await page.getByRole('button', { name: '英国', exact: true }).click()
  await expect(page.getByText('六联疫苗 第 4 剂')).toBeVisible()
  await expect(page.getByText(/UKHSA/)).toBeVisible()
  // Its clinic's name under each, as the booklet there writes it.
  await expect(page.getByText('6-in-1').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '卡介苗 BCG' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // Kept for the baby.
  await page.reload()
  await expect(page.getByRole('button', { name: '英国', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
