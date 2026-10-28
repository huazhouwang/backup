import { type Page, expect, test } from '@playwright/test'

import { newDevice, onboard, signIn } from '../support/app'

/**
 * A long chat history, as the server pages it: the latest 10 messages, then 20 at a time
 * going back. Each request takes a moment, as over a phone's connection.
 */
async function longHistory(page: Page, total = 150) {
  const lines = Array.from({ length: total }, (_, i) => ({
    id: `t${Math.floor(i / 6)}~${i % 6}`,
    threadId: `t${Math.floor(i / 6)}`,
    role: i % 2 ? 'assistant' : 'user',
    text: i % 2 ? `回复 ${i}：好的，已经记下了，还有别的吗？` : `消息 ${i}`,
  }))
  const requests: (string | null)[] = []
  await page.route('**/api/voice', (route) =>
    route.fulfill({ json: { phrase: '记录宝宝', token: null, ai: { kind: 'own' } } }),
  )
  await page.route(/\/api\/voice\/chat(\?.*)?$/, async (route) => {
    const before = new URL(route.request().url()).searchParams.get('before')
    requests.push(before)
    const end = before ? lines.findIndex((line) => line.id === before) : lines.length
    const start = Math.max(0, end - (before ? 20 : 10))
    await new Promise((resolve) => setTimeout(resolve, 200))
    const threads = Object.fromEntries(
      lines.map((line, i) => [line.threadId, { startedAt: Date.now() - (total - i) * 60_000 }]),
    )
    await route.fulfill({
      json: {
        lines: lines.slice(start, end),
        threads,
        next: start > 0 ? lines[start]?.id : null,
        activeThreadId: lines.at(-1)?.threadId,
      },
    })
  })
  return { lines, requests }
}

const scroller = (page: Page) => page.locator('[data-chat-scroll]:not([inert] *)')
const fromEnd = (page: Page) =>
  scroller(page).evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
/** The messages shown (not the date between conversations). */
const bubbles = (page: Page) =>
  scroller(page)
    .locator('[role=log] > p')
    .filter({ hasText: /(消息|回复) \d/ })

test('the chat opens on its latest messages, at the end, however much was read before', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  await onboard(page)
  await signIn(context, 'chatHistory')
  const server = await longHistory(page)
  await page.goto('/')
  const openChat = () => page.getByRole('button', { name: /^对话记录/ }).click()

  await openChat()
  await expect(scroller(page).getByText('回复 149：')).toBeVisible()
  await expect.poll(() => fromEnd(page)).toBeLessThan(2)

  // Scrolling back loads earlier pages, keeping in place what was on screen.
  for (let loaded = 1; loaded <= 5; loaded += 1) {
    // One page at a time: each waits for the one before.
    // oxlint-disable-next-line no-await-in-loop
    const shown = await bubbles(page).count()
    const first = bubbles(page).first()
    // oxlint-disable-next-line no-await-in-loop
    const text = (await first.textContent()) ?? ''
    // oxlint-disable-next-line no-await-in-loop
    await scroller(page).evaluate((el) => {
      el.scrollTop = 0
    })
    // oxlint-disable-next-line no-await-in-loop
    await expect.poll(() => bubbles(page).count()).toBeGreaterThan(shown)
    // oxlint-disable-next-line no-await-in-loop
    const [top, box] = await Promise.all([
      scroller(page).getByText(text, { exact: true }).boundingBox(),
      scroller(page).boundingBox(),
    ])
    // Still on screen, now below the page added above it.
    expect(top && box && top.y > box.y && top.y < box.y + box.height).toBe(true)
  }
  expect(await bubbles(page).count()).toBeGreaterThan(100)

  // Closed, then something is said to Siri, and the chat opened again.
  await page.getByRole('button', { name: '收起' }).click()
  await expect(page).not.toHaveURL(/\/chat/)
  server.lines.push({ id: 'new~0', threadId: 'new', role: 'user', text: '刚刚对 Siri 说的' })
  const before = server.requests.length
  await openChat()
  // At once: only the latest page, at its end, not everything read before.
  expect(await bubbles(page).count()).toBeLessThanOrEqual(12)
  expect(await fromEnd(page)).toBeLessThan(2)
  // Then the latest page again, and nothing else: what was just said shows.
  await expect(scroller(page).getByText('刚刚对 Siri 说的')).toBeVisible()
  expect(server.requests.slice(before)).toEqual([null])
  await expect.poll(() => fromEnd(page)).toBeLessThan(2)
  await context.close()
})
