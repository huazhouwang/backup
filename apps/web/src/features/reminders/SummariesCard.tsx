import type { SummarySettings } from '@lullabo/shared'
import { Card } from '@lullabo/ui/card'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { reminderApi } from './notifications'
import { reminderKeys, reminderQueries } from './queries'
import { usePushState } from './RemindersCard'

/**
 * The evening summaries at 21:00 on this device's clock: the day's every evening, the
 * week's on Sundays with the AI's observation. Signed in, with notifications on.
 */
export function SummariesCard() {
  const { userId } = useAccess()
  const push = usePushState()
  if (!userId || push !== 'on') return null
  return <Summaries userId={userId} />
}

function Summaries({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const { data } = useQuery(reminderQueries.summaries(userId))
  const settings: SummarySettings = data ?? { daily: true, weekly: true }
  const save = useMutation({
    mutationFn: reminderApi.saveSummaries,
    onMutate: (next) => queryClient.setQueryData(reminderKeys.summaries(userId), next),
    onSettled: () => queryClient.invalidateQueries({ queryKey: reminderKeys.summaries(userId) }),
  })
  const rows = [
    { key: 'daily', title: m.summaryDaily(), body: m.summaryDailyBody() },
    { key: 'weekly', title: m.summaryWeekly(), body: m.summaryWeeklyBody() },
  ] as const
  const chip = 'min-h-touch rounded-full px-4 font-extrabold'
  return (
    <Card className="flex flex-col gap-4">
      <span className="text-title font-extrabold">{m.summaryTitle()}</span>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-2">
          <div className="flex flex-col">
            <span className="font-extrabold">{row.title}</span>
            <span className="text-caption text-muted-foreground">{row.body}</span>
          </div>
          <fieldset className="m-0 flex gap-2 border-0 p-0">
            <legend className="sr-only">{row.title}</legend>
            <ToggleChip
              pressed={settings[row.key]}
              className={chip}
              onClick={() => save.mutate({ ...settings, [row.key]: true })}
            >
              {m.vaccineRemindersOn()}
            </ToggleChip>
            <ToggleChip
              pressed={!settings[row.key]}
              className={chip}
              onClick={() => save.mutate({ ...settings, [row.key]: false })}
            >
              {m.vaccineRemindersOff()}
            </ToggleChip>
          </fieldset>
        </div>
      ))}
    </Card>
  )
}
