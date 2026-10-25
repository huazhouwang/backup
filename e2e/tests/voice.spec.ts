import { type Page, expect, test } from '@playwright/test'

import { newDevice, onboard, signIn } from '../support/app'

/**
 * The chat page's microphone, against a stand-in API: the local server can't reach Workers
 * AI. Records from Chromium's fake microphone and checks what is uploaded and what is shown.
 * Hearing waits until `release` is called, so the waiting bubble can be seen.
 */
async function standInApi(page: Page) {
  const uploads: { type: string | null; head: string; query: URLSearchParams }[] = []
  let release: (() => void) | null = null
  await page.route('**/api/voice', (route) =>
    route.fulfill({ json: { phrase: '记录宝宝', token: null, ai: { kind: 'own' } } }),
  )
  // The conversation so far, as the server keeps it and the page refetches it.
  const lines: { id: string; threadId: string; role: string; text: string }[] = []
  await page.route('**/api/voice/chat', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({
        json: { lines, threads: { t: { startedAt: Date.now() } }, next: null, activeThreadId: 't' },
      })
      return
    }
    const body: unknown = request.postDataJSON()
    const text =
      typeof body === 'object' && body !== null && 'text' in body ? String(body.text) : ''
    const reply = `已记录：${text}。还有吗？`
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'user', text })
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'assistant', text: reply })
    await route.fulfill({ json: { reply, done: false, confirming: false } })
  })
  await page.route('**/api/voice/transcribe?*', async (route) => {
    const request = route.request()
    const body = request.postDataBuffer() ?? Buffer.alloc(0)
    uploads.push({
      type: await request.headerValue('content-type'),
      head: body.subarray(0, 4).toString('ascii'),
      query: new URL(request.url()).searchParams,
    })
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({ json: { text: `换尿布 ${uploads.length}` } })
  })
  return { uploads, release: () => release?.() }
}

test('talks to Bobo on its own page, by holding the microphone or tapping it', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'voice')
  const api = await standInApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: /和 Bobo 说/ }).click()
  await expect(page).toHaveURL(/\/chat/)
  await expect(page.getByRole('heading', { name: '和 Bobo 说' })).toBeVisible()
  // A page of its own, covering the tab bar.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  const mic = page.getByRole('button', { name: '按住说话' })
  // Let the page finish sliding up before aiming at the button.
  await page.waitForTimeout(500)

  // Hold to talk, let go to send: a waiting bubble on the user's side turns into what was
  // heard, then the answer follows.
  const box = await mic.boundingBox()
  if (!box) throw new Error('no microphone')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByText('松开发送，上滑取消')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.mouse.up()
  await expect(page.getByText('识别中')).toBeVisible()
  await expect.poll(() => api.uploads.length).toBe(1)
  api.release()
  await expect(page.getByText('我说：换尿布 1')).toBeVisible()
  await expect(page.getByText('已记录：换尿布 1。还有吗？')).toBeVisible()
  await expect(page.getByText('识别中')).toHaveCount(0)
  expect(api.uploads[0]).toMatchObject({ type: 'audio/wav', head: 'RIFF' })
  expect(api.uploads[0]?.query.get('speech')).toBe('zh-CN')

  // Slid up before letting go, nothing is sent.
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 5 })
  await expect(page.getByText('松开取消')).toBeVisible()
  await page.mouse.up()
  await expect(mic).toBeVisible()

  // A tap records hands-free until the next tap.
  await mic.click()
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '说完了，发送' }).click()
  await expect.poll(() => api.uploads.length).toBe(2)
  api.release()
  await expect(page.getByText('已记录：换尿布 2。还有吗？')).toBeVisible()

  // Typing turns the microphone into the send button.
  await page.getByLabel('想说的话').fill('今天怎么样')
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  await expect(mic).toHaveCount(0)

  // Put away, it slides back down to Today.
  await page.getByRole('button', { name: '收起' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('今天的记录')).toBeVisible()
  await context.close()
})
