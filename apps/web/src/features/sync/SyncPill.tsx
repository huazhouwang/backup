import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { timeAgo } from '../../lib/time'
import { useNow } from '../../lib/use-now'
import { m } from '../../paraglide/messages.js'
import { SYNCED_DATA, syncQuery, useStartSync } from '../connections/queries'

/** Sync state and a refresh-all button. Refreshes the data views when a sync finishes. */
export function SyncPill() {
  const { data: status } = useQuery(syncQuery)
  const start = useStartSync()
  const client = useQueryClient()
  const now = useNow(30_000)
  const running = Boolean(status?.running) || start.isPending

  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) {
      for (const queryKey of SYNCED_DATA) void client.invalidateQueries({ queryKey })
    }
    wasRunning.current = running
  }, [running, client])

  const label = running
    ? m.syncing()
    : status?.finishedAt
      ? m.syncedAgo({ time: timeAgo(status.finishedAt, now) })
      : m.syncNever()

  return (
    <button
      type="button"
      onClick={() => start.mutate(undefined)}
      disabled={running}
      aria-label={running ? m.syncingLabel() : m.syncAll()}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:hover:bg-card"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${running ? 'animate-pulse bg-warn' : 'bg-gain'}`}
      />
      <span>{label}</span>
      <RefreshCw className={`size-3.5 ${running ? 'animate-spin' : ''}`} aria-hidden />
    </button>
  )
}
