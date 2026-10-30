import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { RequireBaby } from '../features/babies/RequireBaby'
import { useSelectedBaby } from '../features/babies/use-babies'
import { REPORT_DAYS } from '../features/report/report'
import { ReportPage } from '../features/report/ReportPage'

const searchSchema = z.object({
  days: z
    .union(REPORT_DAYS.map((days) => z.literal(days)))
    .optional()
    .catch(undefined),
  notes: z.boolean().optional().catch(undefined),
})

export const Route = createFileRoute('/report')({
  validateSearch: searchSchema,
  component: Report,
})

function Report() {
  const { days = 7, notes = false } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { baby } = useSelectedBaby()
  return (
    <RequireBaby>
      {baby && (
        <ReportPage
          baby={baby}
          days={days}
          withNotes={notes}
          onDays={(next) =>
            void navigate({ search: (prev) => ({ ...prev, days: next }), replace: true })
          }
          onNotes={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, notes: next || undefined }),
              replace: true,
            })
          }
        />
      )}
    </RequireBaby>
  )
}
