import { type Page, expect, test } from '@playwright/test'

import { onboard, sheet, sheetClosed } from '../support/app'

declare global {
  interface Window {
    /** Each file played, in order (watchMedia). */
    played: { src: string; loop: boolean }[]
    /** The element playing them. */
    media: HTMLMediaElement
  }
}

/**
 * The media element, watched instead of heard: Playwright's Chromium has no AAC decoder, and
 * what matters here is what plays when. `play()` records the file and succeeds.
 */
async function watchMedia(page: Page) {
  await page.addInitScript(() => {
    const played: Window['played'] = []
    window.played = played
    HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
      window.media = this
      played.push({ src: new URL(this.src).pathname, loop: this.loop })
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = () => undefined
  })
  return {
    last: () => page.evaluate(() => window.played.at(-1) ?? null),
    count: () => page.evaluate(() => window.played.length),
    /** The file playing reaches its end. */
    end: () => page.evaluate(() => window.media.dispatchEvent(new Event('ended'))),
  }
}

async function startSleep(page: Page) {
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '现在开始睡觉' }).click()
  await sheetClosed(page)
}

async function pick(page: Page, sound: string, timer: string) {
  await page.getByRole('button', { name: '哄睡声音' }).click()
  await sheet(page).getByRole('radio', { name: sound }).click()
  await sheet(page).getByText(timer, { exact: true }).click()
  await sheet(page).getByRole('button', { name: '开始播放' }).click()
  await sheetClosed(page)
}

test('a noise plays for the sleep, fades out when the timer runs out, and stops', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-27T20:00:00+08:00') })
  const media = await watchMedia(page)
  await onboard(page)
  await startSleep(page)

  await pick(page, '白噪音', '15 分钟')
  expect(await media.last()).toEqual({ src: '/sounds/white-noise.m4a', loop: true })
  const card = page.locator('main')
  await expect(card.getByText('白噪音')).toBeVisible()
  await expect(card.getByText('还剩 15 分钟')).toBeVisible()

  // 45 seconds before the end, the ending takes over and fades away.
  await page.clock.fastForward('14:00')
  await expect(card.getByText('还剩 1 分钟')).toBeVisible()
  await page.clock.fastForward('00:20')
  await expect(card.getByText('渐渐变小声')).toBeVisible()
  expect(await media.last()).toEqual({ src: '/sounds/white-noise-end.m4a', loop: false })
  await media.end()
  await expect(page.getByRole('button', { name: '哄睡声音' })).toBeVisible()
})

test('a lullaby plays again and again until the baby wakes', async ({ page }) => {
  const media = await watchMedia(page)
  await onboard(page)
  await startSleep(page)

  await pick(page, '勃拉姆斯摇篮曲', '不定时')
  expect(await media.last()).toEqual({ src: '/sounds/brahms.m4a', loop: false })
  await expect(page.getByText('一直播放，宝宝醒了就停')).toBeVisible()
  // A pass ends: it starts again.
  await media.end()
  expect(await media.count()).toBe(2)
  expect(await media.last()).toEqual({ src: '/sounds/brahms.m4a', loop: false })

  // The choice is kept for next time.
  await page.getByRole('button', { name: '换个声音或定时' }).click()
  await expect(sheet(page).getByRole('radio', { name: '勃拉姆斯摇篮曲' })).toBeChecked()
  await expect(sheet(page).getByRole('radio', { name: '不定时' })).toBeChecked()
  await page.keyboard.press('Escape')
  await sheetClosed(page)

  // The baby wakes: the sound stops with the sleep.
  await page.getByRole('button', { name: '醒了' }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.media.src)).toBe('')
})
