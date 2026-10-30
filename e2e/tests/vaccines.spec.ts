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

/** A one-pixel PNG: the photo the page shrinks and sends. */
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('a photo of the booklet is read, checked and saved', async ({ page }) => {
  await onboardBornInMay(page)
  await openVaccines(page)
  await page.getByRole('button', { name: '我自己记' }).click()
  // The family's AI reads the page (here, the server's answer stands in for it).
  await page.route('**/api/vaccines/read', async (route) => {
    await route.fulfill({
      json: {
        doses: [
          { vaccineId: 'hepb', name: '乙肝', dose: 1, date: '2026-05-21' },
          { vaccineId: 'bcg', name: '卡介苗', dose: 1, date: '2026-05-21' },
          { vaccineId: null, name: '狂犬病疫苗', dose: 1, date: '2026-09-01' },
        ],
      },
    })
  })
  const reading = page.waitForRequest('**/api/vaccines/read')
  await page.getByLabel('拍接种本').setInputFiles({
    name: 'booklet.png',
    mimeType: 'image/png',
    buffer: PHOTO,
  })
  const sent: unknown = (await reading).postDataJSON()
  expect(sent).toMatchObject({
    region: 'cn',
    image: expect.stringMatching(/^data:image\/jpeg;base64,/),
  })

  // Checked first: a day put right, one left out.
  await expect(sheet(page).getByText('狂犬病疫苗 第 1 剂')).toBeVisible()
  await sheet(page).getByLabel('接种日期').first().fill('2026-05-20')
  await sheet(page).getByRole('button', { name: '卡介苗 第 1 剂' }).click()
  await sheet(page).getByRole('button', { name: '保存 2 剂' }).click()
  await sheetClosed(page)

  // The unknown one is the family's own vaccine now, its dose given.
  await expect(page.getByRole('button', { name: '删除自定义疫苗 狂犬病疫苗' })).toBeVisible()
  await expect(page.getByText(/已打 2 剂/)).toBeVisible()
  await expect(page.getByText(/^卡介苗 第 1 剂$/).first()).toBeVisible()
})

test('a dose can be booked for another day, and a vaccine of the family’s own added', async ({
  page,
}) => {
  await onboardBornInMay(page)
  await openVaccines(page)
  await page.getByRole('button', { name: '我自己记' }).click()

  // The clinic booked the next dose for 25 November.
  await page.getByRole('button', { name: '记录接种' }).click()
  await sheet(page).getByText('改预约日期', { exact: true }).click()
  await sheet(page).getByLabel('预约日期', { exact: true }).fill('2026-11-25')
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(page.getByText(/已预约 · 11月25日/).first()).toBeVisible()

  // A vaccine no schedule has, in two doses.
  await page.getByRole('button', { name: '添加疫苗' }).click()
  await sheet(page).getByLabel('疫苗名称').fill('狂犬病疫苗')
  await sheet(page).getByText('2', { exact: true }).click()
  await sheet(page).getByLabel('第 1 剂日期').fill('2026-11-01')
  await sheet(page).getByLabel('第 2 剂日期').fill('2026-11-04')
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
  await expect(page.getByText('狂犬病疫苗 第 2 剂')).toBeVisible()

  // Kept for the baby.
  await page.reload()
  await expect(page.getByText(/已预约 · 11月25日/).first()).toBeVisible()
  await expect(page.getByText('狂犬病疫苗 第 2 剂')).toBeVisible()
})
