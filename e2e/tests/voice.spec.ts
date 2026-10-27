import { type Page, expect, test } from '@playwright/test'

import { newDevice, onboard, signIn } from '../support/app'
import { drag, transformOf } from '../support/touch'

/** One server-sent event. */
const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

/**
 * The chat page's microphone, against a stand-in API: the local server can't reach Workers
 * AI or a model. Records from Chromium's fake microphone and checks what is uploaded and
 * what is shown. Parts heard while talking come back at once; the whole recording waits for
 * `hear()`, heard with a mistake, and the answer, which corrects it, waits for `answer()`.
 */
/** A finger slid over the frost moves nothing behind it: neither the page nor its pull. */
async function slideOverFrost(page: Page, from: [number, number], to: [number, number]) {
  const release = await drag(page, from, to)
  expect(await transformOf(page, 'main')).toBe('')
  await expect(page.locator('[data-pull-to-refresh] > output')).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  await release()
}

/** `partials: false`: nothing is made out while talking, as with a few words said slowly. */
async function standInApi(page: Page, { partials: hearParts = true } = {}) {
  const uploads: { type: string | null; head: string; query: URLSearchParams }[] = []
  let partials = 0
  const gates = { hear: null as (() => void) | null, answer: null as (() => void) | null }
  const wait = (gate: keyof typeof gates) =>
    new Promise<void>((resolve) => {
      gates[gate] = resolve
    })
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
    const said =
      typeof body === 'object' && body !== null && 'text' in body ? String(body.text) : ''
    const spoken = typeof body === 'object' && body !== null && 'spoken' in body
    await wait('answer')
    const text = spoken ? said.replace('换尿不', '换尿布') : said
    const reply = `已记录：${text}。还有吗？`
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'user', text })
    lines.push({ id: `t~${lines.length}`, threadId: 't', role: 'assistant', text: reply })
    await route.fulfill({
      contentType: 'text/event-stream',
      body: [
        spoken ? event('heard', { text }) : '',
        event('text', { text: '已记录' }),
        event('done', { reply, done: false, confirming: false }),
      ].join(''),
    })
  })
  await page.route('**/api/voice/transcribe?*', async (route) => {
    const request = route.request()
    const query = new URL(request.url()).searchParams
    if (query.get('partial') === '1') {
      partials += 1
      await route.fulfill({ json: { text: hearParts ? '正在说的话' : null } })
      return
    }
    const body = request.postDataBuffer() ?? Buffer.alloc(0)
    uploads.push({
      type: await request.headerValue('content-type'),
      head: body.subarray(0, 4).toString('ascii'),
      query,
    })
    await wait('hear')
    await route.fulfill({ json: { text: `换尿不 ${uploads.length}` } })
  })
  return {
    uploads,
    partials: () => partials,
    hear: () => gates.hear?.(),
    answer: () => gates.answer?.(),
  }
}

test('talks to the AI on its own page, by holding the microphone or tapping it', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'voice')
  const api = await standInApi(page)
  await page.goto('/')
  await page
    .locator('main')
    .getByRole('button', { name: /对话记录/ })
    .click()
  await expect(page).toHaveURL(/\/chat/)
  await expect(page.getByRole('heading', { name: '对话记录' })).toBeVisible()
  // A page of its own, covering the tab bar.
  await expect(page.getByRole('navigation')).toHaveCount(0)
  const mic = page.getByRole('button', { name: '按住说话' })
  // Let the page finish sliding up before aiming at the button.
  await page.waitForTimeout(500)

  // Hold to talk: what has been said so far shows as it is heard. Let go: the whole of it
  // is heard and shown as heard, then corrected in place, then the answer follows.
  const box = await mic.boundingBox()
  if (!box) throw new Error('no microphone')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByText('松开发送，上滑取消')).toBeVisible()
  await expect(page.getByText('正在说的话')).toBeVisible()
  await page.mouse.up()
  await expect(page.getByText('识别中')).toBeVisible()
  await expect.poll(() => api.uploads.length).toBe(1)
  api.hear()
  await expect(page.getByText('我说：换尿不 1')).toBeVisible()
  api.answer()
  await expect(page.getByText('我说：换尿布 1')).toBeVisible()
  await expect(page.getByText('已记录：换尿布 1。还有吗？')).toBeVisible()
  await expect(page.getByText('识别中')).toHaveCount(0)
  expect(api.partials()).toBeGreaterThan(0)
  expect(api.uploads[0]).toMatchObject({ type: 'audio/wav', head: 'RIFF' })
  expect(api.uploads[0]?.query.get('speech')).toBe('zh-CN')

  // Slid up before letting go, nothing is sent.
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.move(box.x + box.width / 2, box.y - 100, { steps: 5 })
  await expect(page.getByText('松开取消')).toBeVisible()
  await page.mouse.up()
  await expect(mic).toBeVisible()
  await expect(page.getByText('正在说的话')).toHaveCount(0)

  // A tap records hands-free until the next tap.
  await mic.click()
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '说完了，发送' }).click()
  await expect.poll(() => api.uploads.length).toBe(2)
  api.hear()
  await expect(page.getByText('我说：换尿不 2')).toBeVisible()
  api.answer()
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

test('takes the microphone again when the first one sends nothing', async ({ browser }) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'micRetake')
  // As on an iPhone now and then: the first microphone is granted but nothing comes through
  // (Chromium's always does, so its samples are dropped here). Count how often it is taken.
  await page.addInitScript(() => {
    const take = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    Reflect.set(window, 'micsTaken', 0)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      Reflect.set(window, 'micsTaken', Number(Reflect.get(window, 'micsTaken')) + 1)
      const stream = await take(constraints)
      Reflect.set(window, 'lastMic', stream)
      return stream
    }
    const Tap = window.AudioWorkletNode
    let first = true
    window.AudioWorkletNode = class extends Tap {
      constructor(...args: ConstructorParameters<typeof AudioWorkletNode>) {
        super(...args)
        if (first) {
          first = false
          this.port.addEventListener = () => undefined
        }
      }
    }
  })
  const micsTaken = () => page.evaluate(() => Number(Reflect.get(window, 'micsTaken')))
  const api = await standInApi(page)
  await page.goto('/')
  await page
    .locator('main')
    .getByRole('button', { name: /对话记录/ })
    .click()
  const mic = page.getByRole('button', { name: '按住说话' })
  await expect(mic).toBeVisible()
  await page.waitForTimeout(500)

  await mic.click()
  // Nothing heard yet: it doesn't say it listens; a second later it takes another and does.
  // Both the conversation's bubble and the microphone's status line, with no time running.
  const preparing = page.getByText('准备中…')
  await expect(preparing).toHaveCount(2)
  await page.waitForTimeout(600)
  await expect(preparing).toHaveCount(2)
  await expect(page.getByText(/\d+:\d\d/)).toHaveCount(0)
  await expect(page.getByText('点麦克风发送')).toBeVisible({ timeout: 5_000 })
  expect(await micsTaken()).toBe(2)
  await page.waitForTimeout(800)
  // Muted by the system while recording (a call, another app): taken again, recording on.
  await page.evaluate(() => {
    const stream: unknown = Reflect.get(window, 'lastMic')
    if (stream instanceof MediaStream) stream.getAudioTracks()[0]?.dispatchEvent(new Event('mute'))
  })
  await expect.poll(micsTaken).toBe(3)
  await page.waitForTimeout(500)
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await page.getByRole('button', { name: '说完了，发送' }).click()
  await expect.poll(() => api.uploads.length).toBe(1)
  expect(api.uploads[0]).toMatchObject({ type: 'audio/wav', head: 'RIFF' })
  expect(api.uploads[0]?.query.get('retakes')).toBe('1')
  expect(Number(api.uploads[0]?.query.get('ready'))).toBeGreaterThanOrEqual(1_000)
})

test('explains the microphone before the system asks, and how to turn it back on', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  // Not decided yet, as on a phone that hasn't been asked (the test browser allows at once).
  await page.addInitScript(() => {
    const status = { state: 'prompt', addEventListener() {}, removeEventListener() {} }
    Object.defineProperty(navigator.permissions, 'query', { value: async () => status })
  })
  await onboard(page)
  await signIn(context, 'micExplain')
  const api = await standInApi(page)
  await page.goto('/')
  await page
    .locator('main')
    .getByRole('button', { name: /对话记录/ })
    .click()
  const mic = page.getByRole('button', { name: '按住说话' })
  await page.waitForTimeout(500)

  // Not decided yet: the explanation comes first; "暂不" leaves the system's question unasked.
  await mic.click()
  const explain = page.getByRole('dialog', { name: '需要打开麦克风' })
  await expect(explain).toBeVisible()
  await expect(explain.getByText('在 Safari 里打开', { exact: false })).toBeVisible()
  await explain.getByRole('button', { name: '暂不' }).click()
  await expect(explain).toHaveCount(0)
  expect(api.uploads).toHaveLength(0)

  // Again, this time going on and not wanting the explanation again: recording starts
  // hands-free.
  await mic.click()
  await explain.getByLabel('不再显示这段说明').check()
  await explain.getByRole('button', { name: '继续' }).click()
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '说完了，发送' }).click()
  await expect.poll(() => api.uploads.length).toBe(1)
  api.hear()
  await expect(page.getByText('我说：换尿不 1')).toBeVisible()
  api.answer()
  await expect(page.getByText('我说：换尿布 1')).toBeVisible()

  // Clearing the device's cache brings explanations back.
  await page.goto('/settings/about')
  await page.getByRole('button', { name: '清除本机缓存' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '清除本机缓存' }).click()
  await expect(page.getByText('已清除')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('bobo.hiddenHints'))).toBe('[]')
  await context.close()
})

test('explains the microphone once until the app is opened again', async ({ browser }) => {
  const { context, page } = await newDevice(browser)
  await page.addInitScript(() => {
    const status = { state: 'prompt', addEventListener() {}, removeEventListener() {} }
    Object.defineProperty(navigator.permissions, 'query', { value: async () => status })
  })
  await onboard(page)
  await signIn(context, 'micOnce')
  await standInApi(page)
  await page.goto('/')
  await page
    .locator('main')
    .getByRole('button', { name: /对话记录/ })
    .click()
  const mic = page.getByRole('button', { name: '按住说话' })
  const explain = page.getByRole('dialog', { name: '需要打开麦克风' })
  await page.waitForTimeout(500)

  // Explained once, gone on: recording starts; dropped, then pressed again, no explanation.
  await mic.click()
  await explain.getByRole('button', { name: '继续' }).click()
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await mic.click()
  await expect(page.getByText('点麦克风发送')).toBeVisible()
  await expect(explain).toHaveCount(0)
  await page.getByRole('button', { name: '取消' }).click()

  // Opened again: explained again (the system asks again too).
  await page.reload()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '按住说话' }).click()
  await expect(explain).toBeVisible()
  await context.close()
})

test('says how to turn the microphone back on once it was refused', async ({ browser }) => {
  const { context, page } = await newDevice(browser)
  await page.addInitScript(() => {
    const status = { state: 'denied', addEventListener() {}, removeEventListener() {} }
    Object.defineProperty(navigator.permissions, 'query', { value: async () => status })
  })
  await onboard(page)
  await signIn(context, 'micDenied')
  await standInApi(page)
  await page.goto('/')
  await page
    .locator('main')
    .getByRole('button', { name: /对话记录/ })
    .click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: '按住说话' }).click()
  const denied = page.getByRole('dialog', { name: '麦克风没有打开' })
  await expect(denied).toBeVisible()
  await expect(denied.getByText('键盘上的听写', { exact: false })).toBeVisible()
  await denied.getByRole('button', { name: '知道了' }).click()
  await expect(denied).toHaveCount(0)
  await context.close()
})

test('talks to the AI from the tab bar, over the blurred page', async ({ browser }) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'tabMic')
  // A phone takes a moment to hand over the microphone; count how often it is taken.
  await page.addInitScript(() => {
    const take = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    Reflect.set(window, 'micsTaken', 0)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      Reflect.set(window, 'micsTaken', Number(Reflect.get(window, 'micsTaken')) + 1)
      await new Promise((resolve) => setTimeout(resolve, 800))
      return take(constraints)
    }
  })
  const micsTaken = () => page.evaluate(() => Number(Reflect.get(window, 'micsTaken')))
  const api = await standInApi(page)
  await page.goto('/')
  const mic = page.getByRole('navigation').getByRole('button', { name: '语音' })
  await expect(mic).toBeVisible()
  // Signed in and settled: the Today bar shows once the account is known.
  await expect(page.locator('main').getByRole('button', { name: /对话记录/ })).toBeVisible()
  await page.waitForTimeout(500)
  const box = await mic.boundingBox()
  if (!box) throw new Error('no microphone')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  // Held: the page blurs, what is said so far shows; let go, it is heard and answered there.
  await page.mouse.move(x, y)
  await page.mouse.down()
  // Getting ready until the microphone is taken, then listening.
  await expect(page.getByText('准备中…')).toBeVisible()
  await expect(page.getByText(/正在听/)).toBeVisible()
  await expect(page.getByText('松开发送')).toBeVisible()
  await expect(page.getByText('正在说的话')).toBeVisible()
  // The overlay's microphone sits right on top of the tab bar's.
  const held = await page.getByRole('button', { name: '说完了，发送' }).boundingBox()
  expect(Math.abs((held?.x ?? 0) + (held?.width ?? 0) / 2 - x)).toBeLessThan(2)
  await page.mouse.up()
  await expect(page.getByText('识别中')).toBeVisible()
  await expect.poll(() => api.uploads.length).toBe(1)
  api.hear()
  await expect(page.getByText('我说：换尿不 1')).toBeVisible()
  api.answer()
  await expect(page.getByText('我说：换尿布 1')).toBeVisible()
  await expect(page.getByText('已记录：换尿布 1。还有吗？')).toBeVisible()
  await expect(page.getByText('按住麦克风继续说 · 点空白处关闭')).toBeVisible()
  // Down (Today's pull to refresh) and up (the page's bounce at its end).
  await slideOverFrost(page, [60, 150], [60, 420])
  await slideOverFrost(page, [60, 420], [60, 150])

  // Held again: the first turn stays, moving up; the next shows as it is heard, then answered.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await expect(page.getByText('正在说的话')).toBeVisible()
  await page.mouse.up()
  await expect(page.getByText('识别中')).toBeVisible()
  await expect(page.getByText('已记录：换尿布 1。还有吗？')).toBeVisible()
  await expect.poll(() => api.uploads.length).toBe(2)
  api.hear()
  await expect(page.getByText('我说：换尿不 2')).toBeVisible()
  api.answer()
  await expect(page.getByText('已记录：换尿布 2。还有吗？')).toBeVisible()
  await expect(page.getByText('我说：换尿布 1')).toBeVisible()
  // Each turn takes the microphone afresh (it is let go in between) and says how long that took.
  expect(await micsTaken()).toBe(2)
  for (const upload of api.uploads.slice(0, 2)) {
    expect(Number(upload.query.get('ready'))).toBeGreaterThanOrEqual(800)
    expect(Number(upload.query.get('mic'))).toBeGreaterThanOrEqual(800)
  }
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByText(/已记录：换尿布/)).toHaveCount(0)

  // Slid right onto cancel: nothing is sent.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.move(x + 96, y, { steps: 5 })
  await expect(page.getByText('松开取消')).toBeVisible()
  await page.mouse.up()
  await expect(page.getByText('松开取消')).toHaveCount(0)
  expect(api.uploads).toHaveLength(2)

  // Slid left onto the chat: nothing is sent and the chat opens.
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(800)
  await page.mouse.move(x - 96, y, { steps: 5 })
  await expect(page.getByText('松开打开对话')).toBeVisible()
  await page.mouse.up()
  await expect(page).toHaveURL(/\/chat/)
  expect(api.uploads).toHaveLength(2)
  await page.goBack()
  await expect(mic).toBeVisible()
  await page.waitForTimeout(500)

  // A tap records hands-free, the microphone turning into stop; "打开对话" goes to the chat.
  await mic.click()
  await expect(page.getByText('正在听')).toBeVisible()
  await expect(page.getByText('松开发送')).toHaveCount(0)
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '说完了，发送' }).click()
  await expect.poll(() => api.uploads.length).toBe(3)
  api.hear()
  await expect(page.getByText('我说：换尿不 3')).toBeVisible()
  api.answer()
  await expect(page.getByText('已记录：换尿布 3。还有吗？')).toBeVisible()
  await page.getByRole('button', { name: '打开对话' }).click()
  await expect(page).toHaveURL(/\/chat/)
  await context.close()
})

test('the tab bar microphone says what it is doing, not to speak, once spoken', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  await context.grantPermissions(['microphone'])
  await onboard(page)
  await signIn(context, 'tabMicHints')
  // A phone takes a moment to hand over the microphone.
  await page.addInitScript(() => {
    const take = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await new Promise((resolve) => setTimeout(resolve, 800))
      return take(constraints)
    }
  })
  const api = await standInApi(page, { partials: false })
  await page.goto('/')
  const mic = page.getByRole('navigation').getByRole('button', { name: '语音' })
  await expect(page.locator('main').getByRole('button', { name: /对话记录/ })).toBeVisible()
  await page.waitForTimeout(500)

  await mic.click()
  // Not yet heard: getting ready, not asking to speak.
  await expect(page.getByText('准备中…')).toBeVisible()
  await expect(page.getByText('请说话…')).toHaveCount(0)
  await expect(page.getByText('请说话…')).toBeVisible()
  await expect(page.getByText(/正在听 · /)).toBeVisible()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: '说完了，发送' }).click()
  // Said, and nothing made out yet: being heard, no longer asking to speak.
  await expect(page.getByText('正在识别…')).toBeVisible()
  await expect(page.getByText('请说话…')).toHaveCount(0)
  await expect(page.getByText(/正在听/)).toHaveCount(0)
  await expect.poll(() => api.uploads.length).toBe(1)
  api.hear()
  await expect(page.getByText('我说：换尿不 1')).toBeVisible()
  api.answer()
  await expect(page.getByText('已记录：换尿布 1。还有吗？')).toBeVisible()
})
