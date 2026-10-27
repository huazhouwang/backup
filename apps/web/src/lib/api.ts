/** Same-origin JSON client for the Lullabo API. */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(path, { ...init, credentials: 'same-origin', headers })
  if (!res.ok) throw new HttpError(res.status)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  if (res.status === 204) return undefined as T
  // The API always answers with JSON; shapes are shared with the server via @lullabo/shared.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (await res.json()) as T
}
