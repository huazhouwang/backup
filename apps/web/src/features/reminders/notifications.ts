import {
  type PushSubscriptionInput,
  type Reminder,
  type SummarySettings,
  type VaccineReminder,
  base64UrlDecode,
} from '@lullabo/shared'

import { apiFetch } from '../../lib/api'
import { isIos, isStandalone } from '../../lib/pwa'

/**
 * Whether this device can receive reminders:
 * - unsupported: no Web Push in this browser
 * - needs-install: iOS only delivers push to apps added to the home screen
 * - denied: the user blocked notifications in the browser or system settings
 * - off / on: whether this device is subscribed
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSubscription()) ? 'on' : 'off'
}

function toInput(subscription: PushSubscription): PushSubscriptionInput {
  const json = subscription.toJSON()
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    // For reminders at a time of day, on this device's clock.
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

/** Asks for permission (call from a tap) and registers this device for reminders. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return getPushState()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/key')
  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlDecode(publicKey),
    }))
  await apiFetch<void>('/api/push/subscription', {
    method: 'PUT',
    body: JSON.stringify(toInput(subscription)),
  })
  return 'on'
}

/** Stops reminders on this device. Best effort: also used when signing out. */
export async function disablePush(): Promise<void> {
  if (!supported()) return
  const subscription = await currentSubscription()
  if (!subscription) return
  await apiFetch<void>('/api/push/subscription', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined)
  await subscription.unsubscribe()
}

/**
 * Re-sends this device's subscription after signing in, so reminders go to whoever uses the
 * device now; browsers may also have rotated the subscription.
 */
export async function refreshPushSubscription(): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return
  const subscription = await currentSubscription()
  if (!subscription) return
  await apiFetch<void>('/api/push/subscription', {
    method: 'PUT',
    body: JSON.stringify(toInput(subscription)),
  })
}

export const sendTestNotification = () =>
  apiFetch<{ sent: number }>('/api/push/test', { method: 'POST', body: '{}' })

export const reminderApi = {
  list: () => apiFetch<Reminder[]>('/api/reminders'),
  vaccines: () => apiFetch<VaccineReminder[]>('/api/reminders/vaccines'),
  summaries: () => apiFetch<SummarySettings>('/api/reminders/summaries'),
  saveSummaries: (settings: SummarySettings) =>
    apiFetch<SummarySettings>('/api/reminders/summaries', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  saveVaccines: (reminder: VaccineReminder) =>
    apiFetch<VaccineReminder>('/api/reminders/vaccines', {
      method: 'PUT',
      body: JSON.stringify(reminder),
    }),
  save: (reminder: Reminder) =>
    apiFetch<Reminder>('/api/reminders', { method: 'PUT', body: JSON.stringify(reminder) }),
}
