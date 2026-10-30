import { z } from 'zod'

import { checkTimestamps, syncFields, timestampSchema } from './common'
import { idSchema } from './id'

export const babySexSchema = z.enum(['female', 'male', 'unspecified'])
export const avatarColorSchema = z.enum(['green', 'blue', 'orange', 'purple', 'pink', 'yellow'])

/**
 * How a family plans a baby's vaccinations (VACCINES): the region whose schedule it follows,
 * the kind picked where there is a choice, and the self-paid vaccines planned.
 */
export const vaccinePlanSchema = z.object({
  region: z.enum(['cn']),
  picked: z.record(z.string().max(40), z.string().max(40)),
  selfPaid: z.array(z.string().max(40)).max(40),
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
