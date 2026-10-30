import type { Baby } from '@lullabo/shared'
import { Card } from '@lullabo/ui/card'
import { ToggleChip } from '@lullabo/ui/toggle-chip'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'

import { m } from '../../paraglide/messages.js'
import { useAccess } from '../../sync/use-access'
import { reminderApi, refreshPushSubscription } from '../reminders/notifications'
import { reminderKeys, reminderQueries } from '../reminders/queries'
import { usePushState } from '../reminders/RemindersCard'

/**
 * Whether this user is reminded of the baby's vaccinations (on unless turned off): three days
 * before and on the day at 9:00, and weekly while one is late. Needs notifications on.
 */
export function VaccineReminders({ baby }: { baby: Baby }) {
  const { userId } = useAccess()
  // Reminders run on the server: signed in, for a baby synced to a family.
  if (!userId || baby.familyId === null) return null
  return <Reminders baby={baby} userId={userId} />
}

function Reminders({ baby, userId }: { baby: Baby; userId: string }) {
  const push = usePushState()
  const queryClient = useQueryClient()
  const { data } = useQuery(reminderQueries.vaccines(userId))
  const on = data?.find((reminder) => reminder.babyId === baby.id)?.enabled ?? true
  // Sends this device's time zone, so reminders come at 9:00 on its clock.
  useEffect(() => {
    void refreshPushSubscription().catch(() => undefined)
  }, [])
  const save = useMutation({
    mutationFn: (enabled: boolean) => reminderApi.saveVaccines({ babyId: baby.id, enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: reminderKeys.vaccines(userId) }),
  })
  const chip = 'min-h-touch rounded-full px-4 font-extrabold'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col">
        <span className="font-extrabold">{m.vaccineRemindersTitle()}</span>
        <span className="text-caption text-muted-foreground">{m.vaccineRemindersBody()}</span>
      </div>
      {push === 'on' ? (
        <div className="flex gap-2">
          <ToggleChip pressed={on} className={chip} onClick={() => save.mutate(true)}>
            {m.vaccineRemindersOn()}
          </ToggleChip>
          <ToggleChip pressed={!on} className={chip} onClick={() => save.mutate(false)}>
            {m.vaccineRemindersOff()}
          </ToggleChip>
        </div>
      ) : (
        <Link to="/settings/reminders" className="font-bold text-accent-foreground">
          {m.vaccineRemindersEnablePush()}
        </Link>
      )}
    </Card>
  )
}
