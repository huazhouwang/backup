/** Record a funnel event (issue 188); fire and forget, never in the way */
import type { EventName } from '@/shared/events';

export function track(name: EventName, projectId?: string, detail?: string) {
  void fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, projectId, detail }),
    keepalive: true,
  }).catch(() => {});
}
