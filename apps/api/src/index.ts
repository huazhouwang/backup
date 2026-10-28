import { createApp } from './app'
import type { Env } from './env'
import { withRanges } from './ranges'
import { runScheduled } from './scheduled'

const app = createApp()

export default {
  fetch(request, env, ctx) {
    // The sounds (run_worker_first in wrangler.jsonc), in the parts media asks for.
    if (env.ASSETS && new URL(request.url).pathname.startsWith('/sounds/')) {
      return withRanges(request, env.ASSETS)
    }
    return app.fetch(request, env, ctx)
  },
  async scheduled(controller, env) {
    await runScheduled(env, controller.scheduledTime)
  },
} satisfies ExportedHandler<Env>
