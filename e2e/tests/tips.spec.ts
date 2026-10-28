import { expect, test } from '@playwright/test'

import { newDevice, onboard, signIn, syncNow } from '../support/app'

test('the Tips tab shows what to expect at the baby’s age, and a tip in full', async ({ page }) => {
  await onboard(page)
  await page.getByRole('navigation').getByRole('link', { name: '贴士' }).click()
  await expect(page).toHaveURL(/\/tips/)
  await expect(page.getByRole('heading', { name: '贴士', level: 1 })).toBeVisible()
  // Born today: the first week, with the newborn's tips and when to see a doctor.
  await expect(page.getByRole('radio', { name: '第 1 周' })).toBeChecked()
  await expect(page.getByText('大部分时间都在睡')).toBeVisible()
  await expect(page.getByText('遇到这些，带宝宝问问医生')).toBeVisible()
  // Signed out: no observation; the records need more days first.
  await expect(page.getByText('本周观察')).toHaveCount(0)
  await expect(page.getByText('多记几天，这里会把宝宝的记录')).toBeVisible()

  // Another stage, from the chips.
  await page.getByText('4 个月', { exact: true }).click()
  await expect(page.getByText('趴着能抬头看四周')).toBeVisible()
  await expect(page.getByText('根据你的记录')).toHaveCount(0)

  await page.getByRole('link', { name: /4 个月睡眠倒退/ }).click()
  await expect(page.getByRole('heading', { name: '4 个月睡眠倒退' })).toBeVisible()
  await expect(page.getByText('可以怎么做')).toBeVisible()
  await page.getByRole('link', { name: '贴士' }).first().click()
  await expect(page).toHaveURL(/\/tips/)
})

test('milestones tick off when tapped, and stay ticked on this device', async ({ page }) => {
  await onboard(page)
  await page.goto('/tips')
  const smile = page.getByRole('checkbox', { name: '对着你笑' })
  await expect(smile).not.toBeChecked()
  await page.getByText('对着你笑').click()
  await expect(smile).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: '对着你笑' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: '手能张开' })).not.toBeChecked()
  // Tapped again: off.
  await page.getByText('对着你笑').click()
  await expect(page.getByRole('checkbox', { name: '对着你笑' })).not.toBeChecked()

  // All of them ticked off: confetti falls, and it is said for screen readers.
  const confetti = page.locator('[data-confetti] span')
  for (const item of ['对着你笑', '你说话时会安静下来或看向你', '趴着能抬一下头']) {
    // oxlint-disable-next-line no-await-in-loop -- tapped one after another
    await page.getByText(item).click()
  }
  await expect(confetti).toHaveCount(0)
  await page.getByText('手能张开').click()
  await expect(confetti.first()).toBeAttached()
  await expect(page.getByText('都做到啦！')).toBeAttached()
  // Unticking one while the pieces fly doesn't send them off again.
  await page.waitForTimeout(300)
  await page.getByText('手能张开').click()
  await expect(page.getByRole('checkbox', { name: '手能张开' })).not.toBeChecked()
  const flights = await confetti
    .first()
    .evaluate((piece) => piece.getAnimations().map((flight) => Number(flight.currentTime)))
  expect(flights).toHaveLength(1)
  expect(flights[0]).toBeGreaterThan(250)
  await expect(confetti).toHaveCount(0, { timeout: 5000 })
})

test('asking about a tip offers questions, and tells the AI which tip it is', async ({
  browser,
}) => {
  const { context, page } = await newDevice(browser)
  await onboard(page)
  await signIn(context, 'tipAsk')
  // A stand-in for the assistant: the local server can't reach a model.
  const sent: unknown[] = []
  // The conversation, as the server keeps it and the page refetches it.
  const lines: { id: string; threadId: string; role: string; text: string }[] = []
  await page.route('**/api/voice/chat', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: { lines, threads: { t: { startedAt: Date.now() } }, next: null, activeThreadId: 't' },
      })
      return
    }
    const body: unknown = route.request().postDataJSON()
    sent.push(body)
    const text =
      typeof body === 'object' && body !== null && 'text' in body ? String(body.text) : ''
    const reply = '每次睡觉都让宝宝仰着睡。'
    lines.push({ id: 't~0', threadId: 't', role: 'user', text })
    lines.push({ id: 't~1', threadId: 't', role: 'assistant', text: reply })
    await route.fulfill({
      contentType: 'text/event-stream',
      body: `event: done\ndata: ${JSON.stringify({ reply, done: false, confirming: false })}\n\n`,
    })
  })
  // Signed in without an AI: no observation card, not even a hint to set one up.
  await syncNow(page)
  const observed = page.waitForResponse('**/api/tips/observation?*')
  await page.goto('/tips')
  expect((await (await observed).json()) as unknown).toMatchObject({ reason: 'noAi' })
  await expect(page.getByText('本周观察')).toHaveCount(0)

  await page.goto('/tips/safe-sleep')
  await page.getByRole('button', { name: '问一问' }).click()
  await expect(page).toHaveURL(/\/chat\?tip=safe-sleep/)
  // Nothing half-written in the field: questions to tap instead.
  await expect(page.getByLabel('想说的话')).toHaveValue('')
  await expect(page.getByText('想了解「安全睡眠」的什么？')).toBeVisible()
  const questions = page.getByRole('group', { name: '可以这样问' })
  await expect(questions.getByRole('button')).toHaveText([
    '具体可以怎么做？',
    '怎样算正常，什么时候要担心？',
    '结合宝宝最近的记录说说',
  ])
  await questions.getByRole('button', { name: '具体可以怎么做？' }).click()
  await expect(page.getByText('每次睡觉都让宝宝仰着睡。')).toBeVisible()
  expect(sent).toEqual([
    expect.objectContaining({ text: '关于「安全睡眠」，具体可以怎么做？', tip: 'safe-sleep' }),
  ])
  // Asked: the questions make way for the conversation.
  await expect(questions).toHaveCount(0)
})

test('opening a tip slides the page itself, leaving nothing behind', async ({ page }) => {
  await onboard(page)
  await page.goto('/tips')
  await page
    .getByRole('link', { name: /按需喂养/ })
    .first()
    .click()
  // The page left stays as a frozen copy while it moves out, hidden from assistive tech.
  const leaving = page.locator('[data-leaving-page]')
  await expect(leaving).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('heading', { name: '按需喂养' })).toBeVisible()
  await expect(leaving).toHaveCount(0)
  await expect(page.locator('main')).not.toHaveAttribute('style', /.+/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => window.innerWidth),
  )
})

test('switching tabs fades the page left out for good, with no ghost of it', async ({ page }) => {
  await onboard(page)
  await page.goto('/tips')
  // Stops the change as soon as it starts, at a point past the page left's fade while the
  // new page is still fading in, and reads how much of the page left shows.
  // Checked every frame: the fade may start a frame after the layer appears, when no
  // mutation is left to report it.
  const seen = page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const check = () => {
          const layer = document.querySelector('[data-leaving-page]')
          const moving = document.getAnimations()
          if (!layer || moving.length === 0) {
            requestAnimationFrame(check)
            return
          }
          for (const animation of moving) {
            animation.pause()
            animation.currentTime = 200
          }
          resolve(getComputedStyle(layer).opacity)
        }
        requestAnimationFrame(check)
      }),
  )
  await page.getByRole('navigation').getByRole('link', { name: '设置' }).click()
  expect(await seen).toBe('0')
})
