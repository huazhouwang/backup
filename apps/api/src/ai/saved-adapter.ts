import type { AdapterFor } from '../agent/budget'
import { decryptKey } from './key-crypto'
import { aiAdapter } from './providers'

/** A saved provider, model and key, as a model adapter. */
export const savedAdapter: AdapterFor = async (env, ai) => {
  if (!env.ENCRYPTION_SECRET) return null
  return aiAdapter(ai.provider, ai.model, await decryptKey(env.ENCRYPTION_SECRET, ai.keyCipher))
}
