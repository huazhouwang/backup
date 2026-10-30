import { z } from 'zod'

import { idSchema } from './id'
import { VACCINE_REGIONS } from './vaccines'

/**
 * A photo of a vaccination booklet's page, for the family's AI to read: a JPEG or PNG data
 * URL the app has already shrunk, well under the request limit.
 */
export const bookletPhotoRequestSchema = z.object({
  babyId: idSchema,
  region: z.enum(VACCINE_REGIONS),
  image: z
    .string()
    .max(900_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
})

/**
 * One dose the AI read off the page: the vaccine on the region's schedule it is (null when
 * none is), its name as written, its number and the day it was given.
 */
export const bookletDoseSchema = z.object({
  vaccineId: z.string().max(40).nullable(),
  name: z.string().trim().min(1).max(40),
  dose: z.number().int().min(1).max(10),
  date: z.iso.date(),
})

export const bookletReadingSchema = z.object({
  doses: z.array(bookletDoseSchema).max(80),
})

export type BookletPhotoRequest = z.infer<typeof bookletPhotoRequestSchema>
export type BookletDose = z.infer<typeof bookletDoseSchema>
export type BookletReading = z.infer<typeof bookletReadingSchema>
