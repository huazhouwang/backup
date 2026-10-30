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
    /** The sound is at `seconds` into its file, as a time update says. */
    at: (seconds: number) =>
      page.evaluate((time) => {
        Object.defineProperty(window.media, 'currentTime', { configurable: true, get: () => time })
        window.media.dispatchEvent(new Event('timeupdate'))
      }, seconds),
  }
}

async function startSleep(page: Page) {
  await page.locator('main').getByRole('button', { name: '睡眠', exact: true }).click()
  await sheet(page).getByRole('button', { name: '现在开始睡觉' }).click()
  await sheetClosed(page)
}

/** From 更多: sets the timer, then taps a sound: it plays at once, and the sheet stays open. */
async function pick(page: Page, sound: string, timer: string) {
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await sheet(page).getByRole('button', { name: '哄睡声音' }).click()
  await sheet(page).getByText(timer, { exact: true }).click()
  await sheet(page).getByRole('radio', { name: sound }).click()
  await expect(sheet(page).getByRole('button', { name: '停止' })).toBeVisible()
  await page.keyboard.press('Escape')
  await sheetClosed(page)
}

test('a noise plays before any sleep, fades out when the timer runs out, and stops', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-27T20:00:00+08:00') })
  const media = await watchMedia(page)
  await onboard(page)

  await pick(page, '白噪音', '15 分钟')
  expect(await media.last()).toEqual({ src: '/sounds/white-noise.m4a', loop: true })
  const playing = page.locator('main').getByRole('button', { name: '换个声音或定时' })
  await expect(playing).toContainText('白噪音')
  await expect(playing).toContainText('还剩 15 分钟')

  // 45 seconds before the end, the ending takes over and fades away.
  await page.clock.fastForward('14:00')
  await expect(playing).toContainText('还剩 1 分钟')
  await page.clock.fastForward('00:20')
  await expect(playing).toContainText('渐渐变小声')
  expect(await media.last()).toEqual({ src: '/sounds/white-noise-end.m4a', loop: false })
  await media.end()
  await expect(playing).toHaveCount(0)
})

test('a lullaby plays on into the sleep, and stops when the baby wakes', async ({ page }) => {
  const media = await watchMedia(page)
  await onboard(page)

  await pick(page, '勃拉姆斯摇篮曲', '不定时')
  // A tune loops too, never coming to an end: iOS goes silent after one, screen locked.
  expect(await media.last()).toEqual({ src: '/sounds/brahms.m4a', loop: true })
  const playing = page.locator('main').getByRole('button', { name: '换个声音或定时' })
  await expect(playing).toContainText('一直播放，宝宝醒了就停')
  // A pass ends and the next begins, in the same play.
  await media.at(120)
  await media.at(0.2)
  expect(await media.count()).toBe(1)

  // The baby falls asleep: the sound plays on.
  await startSleep(page)
  expect(await media.count()).toBe(1)
  await expect(playing).toBeVisible()

  // The player shows what plays; another sound takes over at once, on the same timer.
  await playing.click()
  await expect(sheet(page).getByRole('radio', { name: '勃拉姆斯摇篮曲' })).toBeChecked()
  await expect(sheet(page).getByRole('radio', { name: '不定时' })).toBeChecked()
  await sheet(page).getByRole('radio', { name: '海浪' }).click()
  expect(await media.last()).toEqual({ src: '/sounds/waves.m4a', loop: true })
  await expect(sheet(page).getByRole('radio', { name: '不定时' })).toBeChecked()
  // The timer changes on its own, the sound playing on.
  const plays = await media.count()
  await sheet(page).getByText('30 分钟', { exact: true }).click()
  await expect(sheet(page).getByText(/还剩 30 分钟/)).toBeVisible()
  expect(await media.count()).toBe(plays)
  await page.keyboard.press('Escape')
  await sheetClosed(page)
  await expect(playing).toContainText('海浪')

  // The baby wakes: the sound stops with the sleep.
  await page.getByRole('button', { name: '醒了' }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.media.src)).toBe('')
  await expect(playing).toHaveCount(0)
})

test('a lullaby finishes its pass before its ending, while it still plays', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-27T20:00:00+08:00') })
  const media = await watchMedia(page)
  await onboard(page)
  await pick(page, '勃拉姆斯摇篮曲', '15 分钟')
  const playing = page.locator('main').getByRole('button', { name: '换个声音或定时' })

  // The timer is nearly out mid-pass: the pass plays on.
  await page.clock.fastForward('14:30')
  await media.at(60)
  expect(await media.last()).toEqual({ src: '/sounds/brahms.m4a', loop: true })
  // Back at the start of the tune: its ending takes over, the sound never having stopped.
  await media.at(0.3)
  expect(await media.last()).toEqual({ src: '/sounds/brahms-end.m4a', loop: false })
  await expect(playing).toContainText('渐渐变小声')
  await media.end()
  await expect(playing).toHaveCount(0)
})

test('a sound can start from the sleeping baby’s card too', async ({ page }) => {
  const media = await watchMedia(page)
  await onboard(page)
  await startSleep(page)

  await page.locator('main').getByRole('button', { name: '哄睡声音' }).click()
  await sheet(page).getByRole('radio', { name: '羊水声' }).click()
  expect(await media.last()).toEqual({ src: '/sounds/womb.m4a', loop: true })
  // The sheet stays open to try another; behind it, Today shows what plays.
  await expect(sheet(page).getByRole('radio', { name: '羊水声' })).toBeChecked()
  await page.keyboard.press('Escape')
  await sheetClosed(page)
  await expect(page.locator('main').getByRole('button', { name: '换个声音或定时' })).toContainText(
    '羊水声',
  )
  await expect(page.locator('main').getByRole('button', { name: '哄睡声音' })).toHaveCount(0)
})
