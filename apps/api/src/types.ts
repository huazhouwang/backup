import type { AdapterFor } from './agent/budget'
import type { Auth } from './auth'
import type { Env } from './env'
import type { BookletReader } from './vaccine-photo'

type SessionData = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>

export type AppEnv = {
  Bindings: Env
  Variables: {
    user: SessionData['user']
    session: SessionData['session']
    /** The model behind a saved AI setting, for the routes that call one. */
    adapterFor: AdapterFor
    /** Reads a vaccination booklet photo with a saved AI. */
    bookletReader: BookletReader
  }
}

/** The parts of a Better Auth instance the app uses; tests inject one with extra plugins. */
export interface AuthLike {
  handler: Auth['handler']
  api: { getSession: Auth['api']['getSession'] }
}

export type AuthFor = (env: Env) => AuthLike
