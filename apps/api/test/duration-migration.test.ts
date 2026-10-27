import { readFile } from 'node:fs/promises'

import { newId } from '@lullabo/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnv } from './d1'
import { T0 } from './fixtures'

const MIGRATION = new URL('../migrations/0011_duration_records.sql', import.meta.url)

describe('0011_duration_records', () => {
  let env: Awaited<ReturnType<typeof createTestEnv>>
  beforeAll(async () => {
    env = await createTestEnv()
  })
  afterAll(() => env.dispose())

  it('gives earlier bottles, solids and pumping an end and leaves the rest alone', async () => {
    const db = env.env.DB
    const rows = {
      bottle: ['feeding', { kind: 'bottle', amountMl: 90, milk: 'formula' }],
      solids: ['feeding', { kind: 'solids', food: '米粉' }],
      pumping: ['pumping', { side: 'both', amountMl: 60 }],
      breast: [
        'feeding',
        { kind: 'breast', segments: [{ side: 'left', startAt: T0, endAt: null }] },
      ],
      sleep: ['sleep', { kind: 'nap' }],
      diaper: ['diaper', { contents: 'wet' }],
    } as const
    const ids = Object.fromEntries(Object.keys(rows).map((name) => [name, newId()]))
    await db.batch(
      Object.entries(rows).map(([name, [type, data]]) =>
        db
          .prepare(
            `insert into events (id, baby_id, family_id, type, start_at, end_at, data, created_at, updated_at, seq)
             values (?, 'b', null, ?, ?, null, ?, ?, ?, 0)`,
          )
          .bind(ids[name], type, T0, JSON.stringify(data), T0, T0),
      ),
    )

    // Applied once already by createTestEnv on an empty table; run it again over these rows.
    const sql = await readFile(MIGRATION, 'utf8')
    await db.batch(sql.split('--> statement-breakpoint').map((statement) => db.prepare(statement)))

    const { results } = await db
      .prepare('select id, end_at as endAt, seq, updated_at as updatedAt from events')
      .all<{ id: string; endAt: number | null; seq: number; updatedAt: number }>()
    const byId = new Map(results.map((row) => [row.id, row]))
    for (const name of ['bottle', 'solids', 'pumping']) {
      expect(byId.get(ids[name] ?? '')).toMatchObject({ endAt: T0, seq: 2 })
      expect(byId.get(ids[name] ?? '')?.updatedAt).toBeGreaterThan(T0)
    }
    for (const name of ['breast', 'sleep', 'diaper']) {
      expect(byId.get(ids[name] ?? '')).toMatchObject({ endAt: null, seq: 0, updatedAt: T0 })
    }
  })
})
