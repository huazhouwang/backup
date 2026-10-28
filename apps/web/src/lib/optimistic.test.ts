import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { optimisticOptions } from './optimistic'

const showToast = vi.hoisted(() => vi.fn<(message: string, options?: object) => void>())
vi.mock('@lullabo/ui/toast', () => ({ showToast }))

const KEY = ['ai', 'mine']

/** A promise and the function that settles it: a server that answers when told. */
function deferred<T>() {
  const settle: { resolve?: (value: T) => void } = {}
  const promise = new Promise<T>((resolve) => {
    settle.resolve = resolve
  })
  return { promise, resolve: (value: T) => settle.resolve?.(value) }
}

function setup(server: (ids: string[]) => Promise<string[]>) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(KEY, ['a'])
  const refused = vi.fn<(restored: string[] | undefined) => void>()
  const observer = new MutationObserver(
    queryClient,
    optimisticOptions(queryClient, {
      queryKey: KEY,
      mutationFn: server,
      apply: (_current: string[], ids: string[]) => ids,
      onRefused: refused,
    }),
  )
  return { queryClient, observer, refused }
}

describe('optimistic changes', () => {
  it('show at once, then take the server copy', async () => {
    const server = deferred<string[]>()
    const { queryClient, observer } = setup(() => server.promise)
    const saving = observer.mutate(['a', 'b'])
    await vi.waitFor(() => expect(queryClient.getQueryData(KEY)).toEqual(['a', 'b']))
    server.resolve(['a', 'b', 'from-server'])
    await saving
    expect(queryClient.getQueryData(KEY)).toEqual(['a', 'b', 'from-server'])
  })

  it('go back, say so, and hand back what was there when the server refuses', async () => {
    const { queryClient, observer, refused } = setup(() => Promise.reject(new Error('403')))
    await observer.mutate(['a', 'b']).catch(() => undefined)
    expect(queryClient.getQueryData(KEY)).toEqual(['a'])
    expect(showToast).toHaveBeenCalledWith(expect.any(String), { tone: 'error' })
    expect(refused).toHaveBeenCalledWith(['a'])
  })
})
