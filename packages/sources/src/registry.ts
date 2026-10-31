import { binance } from './binance'
import { bitcoin } from './bitcoin'
import { bybit } from './bybit'
import type { Source } from './define'
import { evm } from './evm'
import { hyperliquid } from './hyperliquid'
import { manual } from './manual'
import { okx } from './okx'
import { solana } from './solana'

/**
 * Every source plugin. Adding a source: create `src/<id>/index.ts` with `defineSource()`, add
 * fixture tests next to it, and list it here.
 */
export const sources: readonly Source[] = [
  manual,
  evm,
  solana,
  bitcoin,
  binance,
  okx,
  bybit,
  hyperliquid,
]

const byId = new Map(sources.map((source) => [source.id, source]))

export function getSource(id: string): Source | undefined {
  return byId.get(id)
}
