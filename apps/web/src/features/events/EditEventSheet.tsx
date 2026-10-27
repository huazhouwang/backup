import type { Event } from '@lullabo/shared'

import { Sheet } from '../../components/ui/Sheet'
import { m } from '../../paraglide/messages.js'
import { EditEventForm } from './EditEventForm'

/** Edits the record with `eventId`; closed while it is null or the record is gone. */
export function EditEventSheet({
  eventId,
  events,
  onClose,
  onDeleted,
}: {
  eventId: string | null
  events: readonly Event[]
  onClose: () => void
  onDeleted?: (event: Event) => void
}) {
  const editing = events.find((event) => event.id === eventId)
  return (
    <Sheet open={editing !== undefined} onClose={onClose} title={m.eventEditTitle()}>
      {editing && (
        <EditEventForm
          key={editing.id}
          event={editing}
          events={events}
          onDone={onClose}
          onDeleted={onDeleted}
        />
      )}
    </Sheet>
  )
}
