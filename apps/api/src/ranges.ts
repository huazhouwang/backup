/**
 * A static asset that honours `Range`. Workers Static Assets answer every request whole, and
 * Safari plays media only from a server that sends the part it asks for (206). The sounds are
 * a few hundred kilobytes, so the whole file is read and the part cut from it.
 */
export async function withRanges(request: Request, assets: Fetcher): Promise<Response> {
  const whole = await assets.fetch(request.url)
  const headers = new Headers(whole.headers)
  headers.set('accept-ranges', 'bytes')
  const asked = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!whole.ok || !asked || (asked[1] === '' && asked[2] === '')) {
    return new Response(request.method === 'HEAD' ? null : whole.body, {
      status: whole.status,
      headers,
    })
  }
  const body = await whole.arrayBuffer()
  const size = body.byteLength
  const [, from = '', to = ''] = asked
  // "bytes=-500" is the last 500 bytes; "bytes=500-" from 500 to the end.
  const start = from === '' ? Math.max(0, size - Number(to)) : Number(from)
  const end = from === '' || to === '' ? size - 1 : Math.min(Number(to), size - 1)
  if (start > end || start >= size) {
    headers.set('content-range', `bytes */${size}`)
    headers.delete('content-length')
    return new Response(null, { status: 416, headers })
  }
  headers.set('content-range', `bytes ${start}-${end}/${size}`)
  headers.set('content-length', String(end - start + 1))
  return new Response(request.method === 'HEAD' ? null : body.slice(start, end + 1), {
    status: 206,
    headers,
  })
}
