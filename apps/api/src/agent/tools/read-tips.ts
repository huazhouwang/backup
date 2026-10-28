import { tipById } from '@lullabo/shared'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { ageOn } from '../guide'
import { stageText, tipText } from '../tips'
import type { ToolContext } from './shared'

/** The app's parenting tips, and what is usual at a baby's age. */
export function readTips(ctx: ToolContext) {
  const { now, timeZone, babies } = ctx
  return toolDefinition({
    name: 'read_tips',
    description:
      "The app's parenting tips, to answer parenting questions from: the tips with these ids " +
      'in full (see the tip list in the instructions), and, for a baby, what is usual at its ' +
      'age: the stage, its tips, milestones and when to see a doctor.',
    inputSchema: z.object({
      ids: z.array(z.string()).max(5).optional().meta({ description: 'Tip ids from the list' }),
      baby: z.string().optional().meta({ description: "A baby's name, for its age's stage" }),
    }),
    outputSchema: z.object({ tips: z.array(z.string()), stage: z.string().optional() }),
  }).server(async ({ ids = [], baby }) => {
    const tips = ids.flatMap((id) => {
      const tip = tipById(id)
      return tip ? [tipText(tip)] : []
    })
    const known = baby ? (await babies()).find((item) => item.name === baby) : undefined
    return known ? { tips, stage: stageText(ageOn(known.birthDate, now, timeZone)) } : { tips }
  })
}
