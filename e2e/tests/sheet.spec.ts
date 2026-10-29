import { expect, test } from '@playwright/test'

import { onboard, sheet, sheetClosed } from '../support/app'

test.describe('bottom sheet', () => {
  test.beforeEach(async ({ page }) => onboard(page))

  test('slides away whole when the backdrop is tapped', async ({ page }) => {
    await page.locator('main').getByRole('button', { name: '尿布', exact: true }).click()
    const save = sheet(page).getByRole('button', { name: '保存' })
    await expect(save).toBeVisible()
    await page.waitForTimeout(500)
    await page.mouse.click(195, 40)
    // Mid-slide the sheet is still open and still shows its content.
    await page.waitForTimeout(120)
    await expect(sheet(page)).toHaveCount(1)
    await expect(save).toBeAttached()
    await sheetClosed(page)
  })

  test('closes when dragged down by its header', async ({ page }) => {
    await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
    const title = sheet(page).getByRole('heading').first()
    await page.waitForTimeout(500)
    const box = await title.boundingBox()
    if (!box) throw new Error('no sheet header')
    await page.mouse.move(box.x + 20, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 20, box.y + 205, { steps: 10 })
    await page.mouse.up()
    await sheetClosed(page)
  })

  test('springs back after a short drag', async ({ page }) => {
    await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
    const title = sheet(page).getByRole('heading').first()
    await page.waitForTimeout(500)
    const box = await title.boundingBox()
    if (!box) throw new Error('no sheet header')
    await page.mouse.move(box.x + 20, box.y + 5)
    await page.mouse.down()
    await page.mouse.move(box.x + 20, box.y + 35, { steps: 3 })
    await page.waitForTimeout(100)
    await page.mouse.up()
    await page.waitForTimeout(600)
    await expect(sheet(page)).toHaveCount(1)
  })

  // Behind a sheet too short to scroll, iOS Safari scrolls the page on a swipe (Chromium here
  // doesn't), so this checks the lock: the page is pinned in place, and back where it was.
  test('pins the page behind while it is up, and leaves it where it was', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 400 })
    await page.evaluate(() => window.scrollTo(0, 200))
    const before = await page.evaluate(() => window.scrollY)
    expect(before).toBeGreaterThan(0)
    await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
    await expect(sheet(page)).toBeVisible()
    // The lock lands just after the sheet shows.
    await expect
      .poll(() =>
        page.evaluate(() => ({
          position: document.body.style.position,
          top: document.body.getBoundingClientRect().top,
        })),
      )
      .toEqual({ position: 'fixed', top: -before })
    await page.keyboard.press('Escape')
    await sheetClosed(page)
    expect(await page.evaluate(() => [document.body.style.position, window.scrollY])).toEqual([
      '',
      before,
    ])
  })
})
