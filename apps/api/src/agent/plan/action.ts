import { DURATION_KINDS } from '@lullabo/shared'
import { z } from 'zod'

const nullableNumber = (description: string) => z.number().nullable().meta({ description })

/**
 * One thing to record, as the assistant's record tool takes it. Every field is present (null
 * when not said); the server builds and validates the real records from it.
 */
export const voiceActionSchema = z.object({
  type: z
    .enum([
      'diaper',
      'breast',
      'bottle',
      'solids',
      'sleep',
      'pumping',
      'temperature',
      'medication',
      'growth',
      'note',
      'stop',
      'undo',
    ])
    .meta({
      description:
        'What to record. breast, bottle, solids, sleep and pumping can be timed. stop ends a ' +
        'running timer ("醒了", "喂完了", "吸完了"); undo takes back the last change',
    }),
  baby: z.string().nullable().meta({ description: 'Baby name as said, or null if not said' }),
  time: z
    .string()
    .nullable()
    .meta({ description: 'Clock time said for when it happened, as HH:MM (24h), else null' }),
  minutesAgo: nullableNumber('For "半小时前" style times: minutes before now, else null'),
  durationMinutes: nullableNumber(
    'How long it took, if said (feeds, sleep, pumping), else null. Without it, breast and ' +
      'sleep start a timer',
  ),
  timer: z
    .boolean()
    .nullable()
    .meta({
      description:
        'True to start a timer now for bottle, solids or pumping ("开始喂奶粉", "开始吸奶"); ' +
        'breast and sleep without a duration start one anyway',
    }),
  stops: z.enum(DURATION_KINDS).nullable().meta({
    description: 'For stop: which timer ends, or null for the only one running',
  }),
  diaper: z.enum(['wet', 'dirty', 'mixed']).nullable(),
  amountMl: nullableNumber('Bottle total, or pumped amount, in ml'),
  milk: z.enum(['breast', 'formula', 'mixed']).nullable().meta({
    description: 'Bottle milk: 母乳 breast, 奶粉/配方奶 formula, both mixed',
  }),
  breastMl: nullableNumber('Mixed bottle: the breast-milk part in ml, if said'),
  formulaMl: nullableNumber('Mixed bottle: the formula part in ml, if said'),
  side: z.enum(['left', 'right', 'both']).nullable().meta({
    description: 'Breastfeeding: the side (fed first); pumping: the side or both',
  }),
  leftMinutes: nullableNumber('Breastfeeding: minutes on the left, if said per side'),
  rightMinutes: nullableNumber('Breastfeeding: minutes on the right, if said per side'),
  food: z.string().nullable().meta({ description: 'Solid food eaten' }),
  celsius: z.number().nullable(),
  medicine: z.string().nullable(),
  dose: z.string().nullable(),
  weightKg: nullableNumber('Growth: weight in kg'),
  lengthCm: nullableNumber('Growth: length or height in cm'),
  headCm: nullableNumber('Growth: head circumference in cm'),
  text: z.string().nullable().meta({ description: 'Note text, for type note' }),
})

export type VoiceAction = z.infer<typeof voiceActionSchema>
