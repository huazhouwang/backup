import { expect, test } from '@playwright/test'

import { logDiaper, newDevice, onboard, sheet, signIn, syncNow, todayRows } from '../support/app'

test('syncs records between two devices and deletes a baby everywhere', async ({ browser }) => {
  const a = await newDevice(browser)
  await onboard(a.page)
  await logDiaper(a.page)
  await signIn(a.context, 'syncA')
  await syncNow(a.page)

  const b = await newDevice(browser)
  await signIn(b.context, 'syncB')
  await syncNow(b.page)
  await b.page.goto('/')
  await expect(todayRows(b.page)).toHaveCount(1)

  // Delete the baby on A (it has a record, so its name must be typed).
  await a.page.goto('/settings/babies')
  await a.page
    .locator('main')
    .getByRole('button', { name: /小米粒/ })
    .click()
  await sheet(a.page).getByRole('button', { name: '删除宝宝' }).click()
  const forever = sheet(a.page).getByRole('button', { name: '永久删除' })
  await expect(forever).toBeDisabled()
  await sheet(a.page)
    .getByLabel(/确认删除/)
    .fill('小米粒')
  await forever.click()
  await syncNow(a.page)

  // A pull may still be on its way when "已同步" shows: sync again until the baby is gone.
  await expect(async () => {
    await syncNow(b.page)
    await b.page.goto('/settings/babies')
    await expect(b.page.locator('main').getByText('小米粒')).toHaveCount(0, { timeout: 3000 })
  }).toPass({ timeout: 30_000 })

  await a.context.close()
  await b.context.close()
})
