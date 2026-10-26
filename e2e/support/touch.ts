import type { Page } from '@playwright/test'

const point = ([x, y]: [number, number]) => ({ x, y, id: 1 })

/** A finger drag as the phone sends it, holding before letting go. */
export async function drag(page: Page, from: [number, number], to: [number, number]) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(from)] })
  for (let step = 1; step <= 8; step += 1) {
    const at: [number, number] = [
      from[0] + ((to[0] - from[0]) * step) / 8,
      from[1] + ((to[1] - from[1]) * step) / 8,
    ]
    // oxlint-disable-next-line no-await-in-loop -- a drag is a sequence of moves
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(at)] })
  }
  return async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  }
}

/** An element's inline transform, as the bounce sets it. */
export const transformOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => (element instanceof HTMLElement ? element.style.transform : ''))
