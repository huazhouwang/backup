import { type Page, expect, test } from '@playwright/test'

import { onboard, openRow, sheet, sheetClosed, todayRows } from '../support/app'

// Every kind of record, logged and then edited from the list.

const more = async (page: Page, kind: string) => {
  await page.locator('main').getByRole('button', { name: '更多记录' }).click()
  await sheet(page).getByRole('button', { name: kind, exact: true }).click()
}
const record = (page: Page) => sheet(page).getByRole('button', { name: '记录' })
const save = async (page: Page) => {
  await sheet(page).getByRole('button', { name: '保存' }).click()
  await sheetClosed(page)
}

test.beforeEach(async ({ page }) => onboard(page))

test('logs a temperature and edits it', async ({ page }) => {
  await more(page, '体温')
  await sheet(page)
    .getByLabel(/体温/)
    .fill('38.2')
  await record(page).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText('38.2 °C')
  await openRow(page)
  await sheet(page)
    .getByLabel(/体温/)
    .fill('37.4')
  await save(page)
  await expect(todayRows(page).first()).toContainText('37.4 °C')
})

test('logs a medication and edits its dose', async ({ page }) => {
  await more(page, '用药')
  await record(page).click()
  await expect(sheet(page).getByText('请填写药名')).toBeVisible()
  await sheet(page).getByLabel('药名').fill('布洛芬')
  await sheet(page).getByLabel('剂量').fill('2.5 毫升')
  await record(page).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText('布洛芬 · 2.5 毫升')
  await openRow(page)
  await sheet(page).getByLabel('剂量').fill('5 毫升')
  await save(page)
  await expect(todayRows(page).first()).toContainText('布洛芬 · 5 毫升')
})

test('logs a growth measurement and edits it', async ({ page }) => {
  await more(page, '生长')
  await sheet(page)
    .getByLabel(/体重/)
    .fill('5.2')
  await sheet(page)
    .getByLabel(/身长/)
    .fill('58')
  await record(page).click()
  await sheetClosed(page)
  const row = todayRows(page).first()
  await expect(row).toContainText('5.2')
  await expect(row).toContainText('58')
  await openRow(page)
  await sheet(page)
    .getByLabel(/头围/)
    .fill('39')
  await save(page)
  await expect(todayRows(page).first()).toContainText('39')
})

test('logs a note and edits it', async ({ page }) => {
  await more(page, '笔记')
  await sheet(page).getByLabel('内容').fill('今天很乖')
  await record(page).click()
  await sheetClosed(page)
  await expect(todayRows(page).first()).toContainText('今天很乖')
  await openRow(page)
  await sheet(page).getByLabel('内容').fill('今天打了疫苗')
  await save(page)
  await expect(todayRows(page).first()).toContainText('今天打了疫苗')
})

test('edits a bottle into breast milk and formula', async ({ page }) => {
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await sheet(page).getByText('瓶喂', { exact: true }).click()
  await sheet(page).getByText('120', { exact: true }).click()
  await save(page)
  await expect(todayRows(page).first()).toContainText('120 毫升 · 配方奶')
  await openRow(page)
  await sheet(page).getByText('混合', { exact: true }).click()
  await sheet(page).getByRole('button', { name: '分开填写母乳和奶粉' }).click()
  await sheet(page).getByLabel('母乳（毫升）').fill('40')
  await sheet(page).getByLabel('奶粉（毫升）').fill('80')
  await save(page)
  await expect(todayRows(page).first()).toContainText('120 毫升 · 母乳 40 + 奶粉 80')
})

test('logs solids and edits what was eaten', async ({ page }) => {
  await page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()
  await sheet(page).getByText('辅食', { exact: true }).click()
  await sheet(page)
    .getByPlaceholder(/米糊/)
    .fill('米粉')
  await save(page)
  await expect(todayRows(page).first()).toContainText('米粉')
  await openRow(page)
  await sheet(page)
    .getByPlaceholder(/米糊/)
    .fill('南瓜泥')
  await save(page)
  await expect(todayRows(page).first()).toContainText('南瓜泥')
})

test('offers both sides first when pumping, and keeps the side when editing', async ({ page }) => {
  await more(page, '吸奶')
  const sides = sheet(page).getByRole('group', { name: '哪一侧' })
  await expect(sides).toContainText('双侧左侧右侧')
  await expect(sides.getByRole('radio', { name: '双侧' })).toBeChecked()
  await sheet(page).getByText('左侧', { exact: true }).click()
  await sheet(page)
    .getByLabel(/吸奶量/)
    .fill('60')
  await save(page)
  await expect(todayRows(page).first()).toContainText('左侧 · 60 毫升')
  await openRow(page)
  await expect(sheet(page).getByRole('radio', { name: '左侧' })).toBeChecked()
})
