/** Worker entry: pages are served by the static assets layer (SPA); only /api/* and share pages (/h/*, for their link previews) reach here. */
import { AsyncLocalStorage } from 'node:async_hooks';
import '@/lib/i18n';
import { paraglideMiddleware } from '@/paraglide/server';
import { overwriteServerAsyncLocalStorage } from '@/paraglide/runtime';
import { api } from './server/api';
import { showcasePage } from './server/showcase-page';

// Paraglide keeps the request's locale in AsyncLocalStorage (nodejs_compat); install it up front
// instead of letting the middleware import async_hooks lazily on the first request.
overwriteServerAsyncLocalStorage(new AsyncLocalStorage());

export default {
  // Resolve the locale from the PARAGLIDE_LOCALE cookie so `getLocale()` / `m.*()` answer in the
  // request's language everywhere below (handlers, Better Auth callbacks, streamed chat). The strategy
  // has no URL part, so the middleware never redirects; the original request is passed through untouched.
  fetch: (req, env, ctx) => paraglideMiddleware(req, () => (new URL(req.url).pathname.startsWith('/h/') ? showcasePage(req) : api.fetch(req, env, ctx))),
} satisfies ExportedHandler<Env>;
