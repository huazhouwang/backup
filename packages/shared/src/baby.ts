import { z } from 'zod'

import { checkTimestamps, syncFields, timestampSchema } from './common'
import { idSchema } from './id'
import { CUSTOM_VACCINE_ID, VACCINE_REGIONS } from './vaccines'

export const babySexSchema = z.enum(['female', 'male', 'unspecified'])
export const avatarColorSchema = z.enum(['green', 'blue', 'orange', 'purple', 'pink', 'yellow'])

/**
 * How a family plans a baby's vaccinations (vaccinesOf): the region whose schedule it
 * follows, the kind picked where there is a choice, and the optional vaccines planned.
 */
export const vaccinePlanSchema = z.object({
  region: z.enum(VACCINE_REGIONS),
  picked: z.record(z.string().max(40), z.string().max(40)),
  selfPaid: z.array(z.string().max(40)).max(40),
  /**
   * "vaccine id:dose" → the day the clinic booked it for. Left out by apps from before it,
   * which the server then keeps (sync/sql.ts); every newer app sends it, empty or not.
   */
  appointments: z
    .record(z.string().max(60), z.iso.date())
    .refine((booked) => Object.keys(booked).length <= 200)
    .optional(),
  /** Vaccines the family added, each dose on its appointment. Kept like `appointments`. */
  custom: z
    .array(
      z.object({
        id: z.string().regex(CUSTOM_VACCINE_ID),
        name: z.string().trim().min(1).max(40),
        doses: z.number().int().min(1).max(10),
      }),
    )
    .max(20)
    .optional(),
})

export const babySchema = z
  .object({
    id: idSchema,
    /** Null while the baby only exists locally (signed out). */
    familyId: idSchema.nullable(),
    name: z.string().trim().min(1).max(40),
    /** Calendar date without time zone, e.g. "2026-09-30". */
    birthDate: z.iso.date(),
    sex: babySexSchema,
    avatarColor: avatarColorSchema,
    archivedAt: timestampSchema.nullable(),
    /** Absent until someone sets it; older apps leave it out, and the server keeps it. */
    vaccinePlan: vaccinePlanSchema.nullable().optional(),
    ...syncFields,
  })
  .superRefine(checkTimestamps)

export type Baby = z.infer<typeof babySchema>
export type BabySex = z.infer<typeof babySexSchema>
export type VaccinePlanSettings = z.infer<typeof vaccinePlanSchema>
export type AvatarColor = z.infer<typeof avatarColorSchema>
