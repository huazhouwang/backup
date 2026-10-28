import { z } from 'zod'

/** `?from=mic`: the tab bar's microphone sent the user here, and the page says why. */
export const fromMic = z.literal('mic').optional().catch(undefined)
