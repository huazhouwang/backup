import { z } from 'zod'

import { base64UrlDecode } from './base64url'

/** Kinds of "it's been a while" reminders: since the last event of that type started. */
export const reminderKindSchema = z.enum(['feeding', 'diaper'])
export type ReminderKind = z.infer<typeof reminderKindSchema>

export const MIN_REMINDER_MINUTES = 30
export const MAX_REMINDER_MINUTES = 12 * 60

export const reminderSchema = z.object({
  babyId: z.string().min(1).max(64),
  kind: reminderKindSchema,
  intervalMinutes: z.number().int().min(MIN_REMINDER_MINUTES).max(MAX_REMINDER_MINUTES),
  enabled: z.boolean(),
})
export type Reminder = z.infer<typeof reminderSchema>

/** Base64url text that decodes to exactly `length` bytes. */
const base64UrlBytes = (length: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+={0,2}$/)
    .refine((value) => {
      try {
        return base64UrlDecode(value).length === length
      } catch {
        return false
      }
    })

/** Whether a user is reminded of a baby's vaccinations. */
export const vaccineReminderSchema = z.object({
  babyId: z.string().min(1).max(64),
  enabled: z.boolean(),
})
export type VaccineReminder = z.infer<typeof vaccineReminderSchema>

/**
 * A user's summaries, at 21:00 on each of their devices' clocks: the day's, every evening,
 * and on Sundays the week's with the AI's observation instead. Both on until turned off.
 */
export const summarySettingsSchema = z.object({
  daily: z.boolean(),
  weekly: z.boolean(),
})
export type SummarySettings = z.infer<typeof summarySettingsSchema>

/** A browser's PushSubscription as sent by the app (PushSubscription.toJSON()). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({
    // An uncompressed P-256 public key and a 16-byte secret, as the Push API defines them.
    p256dh: base64UrlBytes(65),
    auth: base64UrlBytes(16),
  }),
  /** The device's time zone (IANA), for reminders at a time of day. */
  timeZone: z.string().max(64).optional(),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>

/** Body of an unsubscribe: only the endpoint identifies the device. */
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2048) })

/** Payload of a notification, shown by the service worker. */
export interface PushMessage {
  title: string
  body: string
  /** Notifications with the same tag replace each other. */
  tag: string
  /** Path opened when the notification is tapped. */
  url: string
}
