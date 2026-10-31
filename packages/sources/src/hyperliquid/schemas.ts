import { z } from 'zod'

import { isDecimal } from '../position'

const decimal = z.string().refine(isDecimal, 'Expected a decimal string')

/** `{"type":"userAbstraction"}`: how the account's spot and perp balances relate. */
export const abstractionSchema = z.string()

/** `{"type":"clearinghouseState"}`: the perp account on the default (validator-run) dex. */
export const clearinghouseSchema = z.object({
  marginSummary: z.object({ accountValue: decimal }),
  assetPositions: z.array(
    z.object({
      position: z.object({
        coin: z.string().min(1),
        /** Signed size: negative for a short. */
        szi: decimal,
        leverage: z.object({ type: z.enum(['cross', 'isolated']), value: z.number() }),
        entryPx: decimal,
        positionValue: decimal,
        unrealizedPnl: decimal,
        liquidationPx: decimal.nullable(),
        /** Cross: the initial margin. Isolated: the position's own equity, PnL included. */
        marginUsed: decimal,
      }),
    }),
  ),
})

/** `{"type":"spotClearinghouseState"}`: spot token balances. */
export const spotStateSchema = z.object({
  balances: z.array(z.object({ coin: z.string().min(1), token: z.number(), total: decimal })),
})

/** `{"type":"spotMetaAndAssetCtxs"}`: spot pairs, tokens, and each pair's mark price. */
export const spotMetaSchema = z.tuple([
  z.object({
    universe: z.array(z.object({ name: z.string(), tokens: z.tuple([z.number(), z.number()]) })),
    tokens: z.array(
      z.object({ name: z.string(), index: z.number(), fullName: z.string().nullish() }),
    ),
  }),
  z.array(z.object({ coin: z.string(), markPx: decimal.nullish() })),
])

export type SpotMeta = z.output<typeof spotMetaSchema>
