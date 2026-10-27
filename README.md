# Lullabo

A local-first baby tracker for logging feeds, sleep, diapers and growth, shared across the family. It works offline, installs as an app from the browser, and runs on Cloudflare's free plan.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/x0finch/baby-tracker)

## Features

- **Logging in a tap or two**: breast and bottle feeds (breast milk, formula or mixed), solids, sleep and naps, diapers, pumping, temperature, medicine, growth and notes. Feed and sleep timers keep running across devices.
- **Today and stats**: a day timeline and summary, trends by day and week, growth charts against WHO percentiles, nap time predictions and achievements.
- **Several babies**, including twins logged at once.
- **Families**: invite caregivers by link with a role (owner, admin, caregiver, viewer) and the babies they may see. Each person can belong to several families.
- **Local-first sync**: records are written on the device first and work offline. They sync to the cloud once signed in, so another device sees them after signing in.
- **Sign-in** with email and password, passkeys or Google.
- **Reminders** as Web Push notifications, such as "3 hours since the last feed".
- **Siri voice logging**: say "记录宝宝，喝了 120 毫升奶粉". An AI agent records it and answers questions. It checks values against the baby's age and asks when something sounds misheard. Each person brings their own OpenAI or OpenRouter key, or uses one shared in the family. See [docs/siri.md](docs/siri.md).
- **CSV export**, light and dark themes, metric or imperial units. The interface is in Chinese.

## Deploy

### One click

Use the **Deploy to Cloudflare** button above. Cloudflare copies this repository to your GitHub account and creates the `bobo-db` D1 database. Every later push to the copy builds and deploys it again, and each deploy applies the database migrations.

It asks for three values (listed in `.dev.vars.example`):

| Name                 | Value                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `BETTER_AUTH_URL`    | the app's address: `https://bobo.<your-subdomain>.workers.dev`, where the subdomain is shown under **Workers & Pages**, or your own domain |
| `BETTER_AUTH_SECRET` | 32+ random characters, e.g. from `openssl rand -hex 32`                                                                                    |
| `ENCRYPTION_SECRET`  | 32+ random characters; encrypts saved AI keys                                                                                              |

Sign-in only works from `BETTER_AUTH_URL`. If you change the Worker's name or add a domain, update it in the Worker's **Settings → Variables and Secrets**. Google sign-in and password-reset emails are optional; see [docs/deploy.md](docs/deploy.md).

### From GitHub Actions

`.github/workflows/deploy.yml` deploys every push to `main`, using secrets set in the repository. This is how the main instance runs. Setup, custom domains, Google sign-in and email are covered in [docs/deploy.md](docs/deploy.md).

## Development

Requires Node.js 22+ and pnpm 12 (version pinned via `packageManager`).

```sh
pnpm install
cp .dev.vars.example .dev.vars   # then fill it in; BETTER_AUTH_URL=http://localhost:3000
pnpm --filter @lullabo/api db:migrate:local
pnpm dev           # web on :3000 (proxies /api) + wrangler dev on :8787 (no Workers AI: no speech)
```

```sh
pnpm build         # build all packages
pnpm check         # format:check + lint + typecheck + test (run before pushing)
pnpm format        # format with oxfmt
pnpm lint          # oxlint with type-aware rules
pnpm typecheck     # tsc (TypeScript 7)
pnpm test          # vitest
pnpm test:e2e      # build the web app, then Playwright end-to-end tests (e2e/)
pnpm --filter @lullabo/api eval   # voice agent evals against real models (needs a key)
```

Tooling: [oxlint](https://oxc.rs/docs/guide/usage/linter) (type-aware via `oxlint-tsgolint`), [oxfmt](https://oxc.rs/docs/guide/usage/formatter), TypeScript 7 and Vitest. In VS Code, install the recommended Oxc extension for format-on-save and lint fixes.

### End-to-end tests

`e2e/` drives the built app in Chromium against a local API: `wrangler dev` with a throwaway D1 database and seeded sessions (see `e2e/scripts/serve.mjs`).

- It covers logging and undo, timers, two-device sync, invites and family deletion, the bottom sheet, and screenshots of the key screens.
- CI runs it in the Playwright container on every pull request.
- After an intended visual change, run the **E2E screenshots** workflow on the branch to regenerate the baselines in `e2e/tests/*-snapshots`.

### Agent evals

Unit tests run the voice agent with a scripted model. `apps/api/evals` plays scenarios against real models and reports how often each asks about misheard values and records plausible ones. Run it from **Actions → Agent evals**; it also runs weekly. See [docs/siri.md](docs/siri.md#evals).

## Architecture

| Path              | Package           | Description                                               |
| ----------------- | ----------------- | --------------------------------------------------------- |
| `apps/web`        | `@lullabo/web`    | TanStack Start client (static SPA), TanStack DB and Query |
| `apps/api`        | `@lullabo/api`    | Hono API on Cloudflare Workers, D1, TanStack AI agent     |
| `packages/shared` | `@lullabo/shared` | Schemas and types shared by web and api                   |
| `e2e`             | `@lullabo/e2e`    | Playwright end-to-end tests                               |

Internal packages export TypeScript source directly; consuming apps compile them with their own bundler.

**Web.** Records live in IndexedDB as TanStack DB collections. A local write and its sync-queue entry commit in one transaction, and a sync engine pushes and pulls changes by cursor. Server data in settings goes through TanStack Query.

**API.** One Worker, configured in `wrangler.jsonc` at the repository root, serves the SPA build through Workers Static Assets; only `/api/*` runs Worker code. The D1 schema is in `apps/api/src/db/schema.ts`, with Drizzle migrations in `apps/api/migrations`. After changing the schema, run `pnpm --filter @lullabo/api db:generate`. A cron trigger sends reminders every minute and clears old voice conversations hourly.

**Auth** uses [Better Auth](https://better-auth.com), tuned for the Workers free plan (10 ms CPU):

- the minimal build
- a signed cookie cache, so most requests validate the session without D1
- no password hashing on the server (the client stretches the password)
- new passwords are checked on the device: obvious ones are refused, and so are ones found in [Have I Been Pwned](https://haveibeenpwned.com/API/v3#PwnedPasswords), queried by the first 5 characters of the SHA-1; if the check can't be reached, the password is allowed
- Workers rate limiters instead of DB-backed rate limiting

## Internationalization

UI strings live in `apps/web/messages/{locale}.json` and are compiled by [Paraglide JS](https://paraglidejs.com) into typed functions (`m.someKey()`) in `apps/web/src/paraglide` (generated on install and by the Vite plugin; not committed). Only `zh-CN` ships today.

- Never hard-code user-facing text in JSX; `react/jsx-no-literals` enforces this.
- Format numbers and dates with the helpers in `apps/web/src/lib/i18n.ts`, which use `Intl` with the active locale.
- To add a locale, add it to `apps/web/project.inlang/settings.json` and create `messages/<locale>.json`. The language picker in settings appears once there is more than one locale.

## License

[Apache License 2.0](LICENSE). You may use, change and sell Lullabo, including in closed-source and commercial products. If you distribute it or a work based on it, keep the license and the [NOTICE](NOTICE) file, which credits this project, and say which files you changed.
