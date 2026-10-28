/** Record a funnel event (issue 188); fire and forget, never in the way */
import type { EventName } from '@/shared/events';

/** `showcase`: the share page's token, for events of its visitors */
export function track(name: EventName, projectId?: string, detail?: string, showcase?: string) {
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, projectId, detail, showcase }),
    keepalive: true,
  }).catch(() => {});
}
