import { z } from 'zod'

/** The longest message to the agent, typed or said. */
export const MAX_TEXT = 300

const isTimeZone = (zone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone !== ''
  } catch {
    return false
  }
}

/** An IANA time zone the runtime knows, such as the device's. */
export const timeZoneSchema = z.string().max(64).refine(isTimeZone)

/** The app's language, which the assistant replies in. */
export const localeSchema = z
  .string()
  .max(35)
  .refine((locale) => {
    try {
      return Intl.getCanonicalLocales(locale).length === 1
    } catch {
      return false
    }
  })

/** A message to the agent, from the chat box or the Siri shortcut. */
export const textSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT),
  timeZone: timeZoneSchema.optional(),
  locale: localeSchema.optional(),
  /** Heard from a recording: speech recognition's mistakes are corrected first. */
  spoken: z.boolean().optional(),
  /**
   * The chat's last few lines, which help correct what was heard. Only context: a long
   * reply is cut short rather than refusing the message.
   */
  recent: z
    .array(z.string().transform((line) => line.slice(0, MAX_TEXT)))
    .transform((lines) => lines.slice(-4))
    .optional(),
  /** The tip the chat was opened from, to ask about it (a tip id). */
  tip: z.string().max(64).optional(),
})
