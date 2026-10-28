import { describe, expect, it } from 'vitest'

import { withRanges } from '../src/ranges'

const FILE = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 256))

/** Static assets as Workers serve them: always the whole file. */
const assets = {
  fetch: (url: string) =>
    Promise.resolve(
      url.endsWith('/sounds/missing.m4a')
        ? new Response('not found', { status: 404 })
        : new Response(FILE, { headers: { 'content-type': 'audio/mp4' } }),
    ),
} as unknown as Fetcher

const get = (range?: string, method = 'GET') =>
  withRanges(
    new Request('https://app.test/sounds/brahms.m4a', {
      method,
      headers: range ? { range } : {},
    }),
    assets,
  )

describe('withRanges', () => {
  it('sends the part asked for', async () => {
    const res = await get('bytes=0-1')
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 0-1/1000')
    expect(res.headers.get('content-length')).toBe('2')
    expect(res.headers.get('content-type')).toBe('audio/mp4')
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1])
  })

  it('reads open and suffix ranges, and clamps the end', async () => {
    expect((await get('bytes=990-')).headers.get('content-range')).toBe('bytes 990-999/1000')
    expect((await get('bytes=-10')).headers.get('content-range')).toBe('bytes 990-999/1000')
    expect((await get('bytes=500-5000')).headers.get('content-range')).toBe('bytes 500-999/1000')
  })

  it('sends the whole file without a range, saying ranges are welcome', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect((await res.arrayBuffer()).byteLength).toBe(1000)
  })

  it('refuses a range past the end', async () => {
    const res = await get('bytes=1000-')
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */1000')
  })

  it('passes a missing file through', async () => {
    const res = await withRanges(
      new Request('https://app.test/sounds/missing.m4a', { headers: { range: 'bytes=0-1' } }),
      assets,
    )
    expect(res.status).toBe(404)
  })

  it('answers HEAD without a body', async () => {
    const res = await get('bytes=0-1', 'HEAD')
    expect(res.status).toBe(206)
    expect(await res.text()).toBe('')
  })
})
