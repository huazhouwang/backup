import { mkdirSync, writeFileSync } from 'node:fs'

import { type Page, test } from '@playwright/test'

import { logDiaper, onboard } from '../support/app'
import { drag } from '../support/touch'

/**
 * The bottom sheet's motion, scenario by scenario. Each step either freezes every running
 * animation at a fixed time or waits for things to settle, then saves a screenshot and the
 * sheet's geometry, so the same scenario on two builds can be compared frame by frame.
 */

const OUT = process.env.MOTION_OUT ?? 'motion-results'

/** Every animation on the page, the backdrop's and CSS transitions included, held at `ms`. */
const freezeAt = (page: Page, ms: number) =>
  page.evaluate((time) => {
    for (const animation of document.getAnimations()) {
      animation.pause()
      animation.currentTime = time
    }
  }, ms)

const resume = (page: Page) =>
  page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.play()
  })

const animating = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().some((a) => a.playState === 'running'))

async function recorder(page: Page, scenario: string) {
  const dir = `${OUT}/${scenario}`
  mkdirSync(dir, { recursive: true })
  const trace: unknown[] = []
  let index = 0
  return {
    async capture(name: string) {
      index += 1
      const label = `${String(index).padStart(2, '0')}-${name}`
      await page.screenshot({ path: `${dir}/${label}.png`, animations: 'allow' })
      trace.push({
        frame: label,
        ...(await page.evaluate(() => {
          const dialog = document.querySelector('[data-slot=sheet], dialog[open]')
          const rect = dialog?.getBoundingClientRect()
          return {
            sheetTop: rect ? Math.round(rect.top) : null,
            sheetHeight: rect ? Math.round(rect.height) : null,
            bodyPosition: document.body.style.position,
            bodyTop: Math.round(document.body.getBoundingClientRect().top),
            scrollY: Math.round(window.scrollY),
          }
        })),
      })
    },
    /** The running animations frozen at each of these times in turn, one frame each. */
    async frames(times: number[]) {
      for (const ms of times) {
        // oxlint-disable-next-line no-await-in-loop -- frames are taken one after another
        await freezeAt(page, ms)
        // oxlint-disable-next-line no-await-in-loop
        await this.capture(`t${ms}`)
      }
    },
    save() {
      writeFileSync(`${dir}/trace.json`, `${JSON.stringify(trace, null, 2)}\n`)
    },
  }
}

const openFeeding = (page: Page) =>
  page.locator('main').getByRole('button', { name: '喂养', exact: true }).click()

async function header(page: Page) {
  const box = await page.getByRole('dialog').getByRole('heading').first().boundingBox()
  if (!box) throw new Error('no sheet header')
  return box
}

test.beforeEach(async ({ page }) => {
  // The same moment every run: times and "N 分钟前" on screen stay put.
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00+08:00'))
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = '[data-sonner-toaster] { display: none !important; }'
    document.addEventListener('DOMContentLoaded', () => document.head.append(style))
  })
  await onboard(page)
})

test('opens', async ({ page }) => {
  const r = await recorder(page, 'open')
  await openFeeding(page)
  await animating(page)
  await r.frames([0, 40, 80, 120, 160, 200, 260, 320, 380])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('settled')
  r.save()
})

test('closes from the backdrop', async ({ page }) => {
  const r = await recorder(page, 'backdrop-close')
  await openFeeding(page)
  await page.waitForTimeout(600)
  await r.capture('open')
  await page.mouse.click(195, 40)
  await animating(page)
  await r.frames([380, 320, 260, 200, 140, 80, 20])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('closed')
  r.save()
})

test('closes on Escape', async ({ page }) => {
  const r = await recorder(page, 'escape-close')
  await openFeeding(page)
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await animating(page)
  await r.frames([300, 150, 20])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('closed')
  r.save()
})

test('springs back after a short drag', async ({ page }) => {
  const r = await recorder(page, 'drag-spring-back')
  await openFeeding(page)
  await page.waitForTimeout(600)
  const box = await header(page)
  await page.mouse.move(box.x + 20, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, box.y + 45, { steps: 4 })
  await r.capture('held-40')
  await page.mouse.up()
  await animating(page)
  await r.frames([200, 240, 280, 320, 360, 399])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('settled')
  r.save()
})

test('closes when dragged far', async ({ page }) => {
  const r = await recorder(page, 'drag-close')
  await openFeeding(page)
  await page.waitForTimeout(600)
  const box = await header(page)
  await page.mouse.move(box.x + 20, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, box.y + 105, { steps: 5 })
  await r.capture('held-100')
  await page.mouse.move(box.x + 20, box.y + 205, { steps: 5 })
  await r.capture('held-200')
  await page.mouse.up()
  await animating(page)
  await r.frames([190, 140, 90, 40])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('closed')
  r.save()
})

test('bounces at the ends of its content', async ({ page }) => {
  const r = await recorder(page, 'content-bounce')
  // A short sheet, pulled up past its end.
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await page.waitForTimeout(600)
  const short = await page.getByRole('dialog').locator('button').last().boundingBox()
  if (!short) throw new Error('no sheet content')
  let release = await drag(page, [short.x + 20, short.y], [short.x + 20, short.y - 150])
  await r.capture('short-pulled-up')
  await release()
  await page.waitForTimeout(800)
  await r.capture('short-settled')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  // A long sheet, scrolled to its end and pulled further.
  await openFeeding(page)
  await page.waitForTimeout(600)
  await page.getByRole('dialog').evaluate((dialog) => {
    dialog.scrollTop = dialog.scrollHeight
  })
  await page.waitForTimeout(200)
  await r.capture('long-at-end')
  release = await drag(page, [200, 700], [200, 500])
  await r.capture('long-pulled-up')
  await release()
  await page.waitForTimeout(800)
  await r.capture('long-settled')
  r.save()
})

test('pins the page behind it', async ({ page }) => {
  const r = await recorder(page, 'scroll-lock')
  await page.setViewportSize({ width: 390, height: 400 })
  await page.evaluate(() => window.scrollTo(0, 200))
  await r.capture('page-scrolled')
  await page.locator('main').getByRole('button', { name: '更多', exact: true }).click()
  await page.waitForTimeout(600)
  await r.capture('sheet-up')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await r.capture('sheet-gone')
  r.save()
})

test('rests on the keyboard', async ({ page }) => {
  const r = await recorder(page, 'keyboard')
  await openFeeding(page)
  await page.waitForTimeout(600)
  await page.getByRole('dialog').getByText('瓶喂', { exact: true }).click()
  await page.waitForTimeout(300)
  await page
    .getByRole('dialog')
    .getByLabel(/奶量/)
    .first()
    .focus()
  // As iOS does: the visual viewport shrinks under a 300px keyboard.
  await page.evaluate(() => {
    const viewport = window.visualViewport!
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => window.innerHeight - 300,
    })
    viewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(400)
  await r.capture('keyboard-up')
  r.save()
})

test('changes height with its content', async ({ page }) => {
  const r = await recorder(page, 'content-change')
  await openFeeding(page)
  await page.waitForTimeout(600)
  await r.capture('breast')
  await page.getByRole('dialog').getByText('瓶喂', { exact: true }).click()
  await page.waitForTimeout(400)
  await r.capture('bottle')
  await page.getByRole('dialog').getByText('辅食', { exact: true }).click()
  await page.waitForTimeout(400)
  await r.capture('solids')
  r.save()
})

test('hands over to another sheet', async ({ page }) => {
  const r = await recorder(page, 'handover')
  await logDiaper(page)
  await page.goto('/settings/babies')
  await page
    .locator('main')
    .getByRole('button', { name: /小米粒/ })
    .click()
  await page.waitForTimeout(600)
  await r.capture('edit-baby')
  await page.getByRole('dialog').getByRole('button', { name: '删除宝宝' }).click()
  await animating(page)
  await r.frames([60, 180, 300])
  await resume(page)
  await page.waitForTimeout(600)
  await r.capture('confirm')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await r.capture('closed')
  r.save()
})

test('skips the slide with reduced motion', async ({ page }) => {
  const r = await recorder(page, 'reduced-motion')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openFeeding(page)
  await page.waitForTimeout(100)
  await r.capture('open')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  await r.capture('closed')
  r.save()
})
