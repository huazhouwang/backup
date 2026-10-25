import { type Page, expect, test } from '@playwright/test'

import { newDevice, onboard, sheet, signIn } from '../support/app'

/**
 * The chat box's microphone, against a stand-in API: the local server can't reach Workers AI.
 * Records from Chromium's fake microphone and checks what is uploaded and what is shown.
 */
async function standInApi(page: Page) {
  const uploads: { type: string | null; head: string; query: URLSearchParams }[] = []
  await page.route('**/api/voice', (route) =>
    route.fulfill({ json: { phrase: '记录宝宝', token: null, ai: { kind: 'own' } } }),
  )
  // The conversation so far, as the server keeps it and the sheet refetches it.
  const lines: { id: string; threadId: string; role: string; text: string }[] = []
  await page.route('**/api/voice/chat', (route) =>
    route.fulfill({
      json: { lines, threads: { t: { startedAt: Date.now() } }, next: null, activeThreadId: 't' },
    }),
  )
  await page.route('**/api/voice/chat/audio?*', async (route) => {
    const request = route.request()
    const body = request.postDataBuffer() ?? Buffer.alloc(0)
    uploads.push({
      type: await request.headerValue('content-type'),
      head: body.subarray(0, 4).toString('ascii'),
      query: new URL(request.url()).searchParams,
    })
    const heard = `小米粒换尿布了 ${uploads.length}`
    const reply = '已记录：换尿布。还有吗？'
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'user', text: heard })
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'assistant', text: reply })
    await route.fulfill({ json: { reply, done: false, confirming: false, heard } })
  })
  return uploads
}

test('talks to Bobo by holding the microphone, or tapping it hands-free', async ({ browser }) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'voice')
  const uploads = await standInApi(page)
  await page.goto('/')
  await page.getByRole('button', { name: /和 Bobo 说/ }).click()
  const mic = sheet(page).getByRole('button', { name: '按住说话' })
  await expect(mic).toBeVisible()
  // Let the sheet finish sliding in before aiming at the button.
  await page.waitForTimeout(500)

  // Hold to talk, let go to send: the words heard come back as the user's message.
  const box = await mic.boundingBox()
  if (!box) throw new Error('no microphone')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(sheet(page).getByText('松开发送，上滑取消')).toBeVisible()
  await page.waitForTimeout(1200)
  await page.mouse.up()
  await expect(sheet(page).getByText('小米粒换尿布了 1')).toBeVisible()
  await expect(sheet(page).getByText('已记录：换尿布。还有吗？').first()).toBeVisible()
  expect(uploads[0]).toMatchObject({ type: 'audio/wav', head: 'RIFF' })
  expect(uploads[0]?.query.get('speech')).toBe('zh-CN')

  // Slid up before letting go, nothing is sent.
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 5 })
  await expect(sheet(page).getByText('松开取消')).toBeVisible()
  await page.mouse.up()
  await expect(mic).toBeVisible()

  // A tap records hands-free until the next tap.
  await mic.click()
  await expect(sheet(page).getByText('点麦克风发送')).toBeVisible()
  await page.waitForTimeout(1000)
  await sheet(page).getByRole('button', { name: '说完了，发送' }).click()
  await expect(sheet(page).getByText('小米粒换尿布了 2')).toBeVisible()
  expect(uploads).toHaveLength(2)

  // Typing turns the microphone into the send button.
  await sheet(page).getByLabel('想说的话').fill('今天怎么样')
  await expect(sheet(page).getByRole('button', { name: '发送', exact: true })).toBeVisible()
  await expect(mic).toHaveCount(0)
  await context.close()
})
