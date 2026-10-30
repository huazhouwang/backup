import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Env } from '../src/env'
import { runScheduled } from '../src/scheduled'
import { createTestEnv } from './d1'

const ON_THE_HOUR = Date.UTC(2026, 9, 19, 3, 0)

describe('cron', () => {
  let env: Env
  let dispose: () => Promise<void>
  beforeAll(async () => {
    ;({ env, dispose } = (await createTestEnv()) as { env: Env; dispose: () => Promise<void> })
  })
  afterAll(() => dispose())

  it('still deletes old conversations when sending reminders fails', async () => {
    await env.DB.prepare(
      'insert into chat_threads (thread_id, messages_json, updated_at) values (?, ?, ?)',
    )
      .bind('voice_old', '[]', ON_THE_HOUR - 31 * 86_400_000)
      .run()
    // Reminders read their table first; make that fail.
    const failing = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('from reminders')) throw new Error('boom')
            return target.prepare(sql)
          }
        }
        const value: unknown = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const results = await runScheduled({ ...env, DB: failing }, ON_THE_HOUR)
    // Reminders fail; vaccination reminders and retention still run.
    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled'])
    const left = await env.DB.prepare('select count(*) as n from chat_threads').first<{
      n: number
    }>()
    expect(left?.n).toBe(0)
    error.mockRestore()
  })
})
