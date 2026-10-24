# Plinth

A general-purpose house design platform with a built-in agent: the homeowner states needs and makes decisions, and the agent authors the design — drawing walls and openings, laying out rooms, computing areas and checking its own work.
Overall design and roadmap: [#1](https://github.com/x0finch/Plinth/issues/1). Requirements are tracked as GitHub issues.

The UI is available in Chinese (default) and English, chosen in Settings → Language (Paraglide JS, messages in `apps/web/messages/`). Each design also has its own language for the names it generates (levels, walls, openings). Everything in the repository is in English (see `CLAUDE.md`).

## Layout

| Directory | Contents |
| --- | --- |
| `packages/core` | Pure TypeScript core, no browser dependencies: data schema, operation layer (transactions, undo), capability registry, rule checks, constraint solver, areas, 3D wall segmentation |
| `apps/web` | Website: TanStack Router SPA + Cloudflare Worker (Hono), D1 storage, Better Auth sign-in, TanStack AI chat |
| `libraries` | Look libraries as files (`*.looklib.json`, format in `looklib.schema.json`): the default library (furniture, doors and windows, railings, elements, and every material) and the Chinese pieces |
| `samples/wushi-10` | Test sample: Wushi courtyard, scheme 10 |

Key conventions:
- Every mutation (UI, agent, `window.artifact.call`) calls the same capability registry (`packages/core/src/capabilities/builtins.ts` + `apps/web/src/features/editor/agent/view-capabilities.ts`) and goes through the same transaction and undo stack.
- The agent's tools are the capability registry, executed in the browser that has the project open; the server only forwards model requests using the project's configured key.
- Pages are served directly by the static asset layer; the Worker only handles `/api/*` and doesn't bundle React (about 0.7 MB compressed, fits the free plan).

## Local development

```sh
npm install
cd apps/web
cp .dev.vars.example .dev.vars        # fill in BETTER_AUTH_SECRET and KEY_ENCRYPTION_SECRET (openssl rand -base64 32)
npm run db:migrate:local
npm run dev                            # http://localhost:3000; OTP codes are printed to the terminal
```

## Testing

```sh
npm test                               # core: area reference values, capability contracts, constraints (repo root)
npm run bench                          # core: transaction timings on the sample project
npm run lint && npm run format:check   # oxlint, oxfmt (npm run format writes)
cd apps/web
npm test                               # web unit tests: editor store (autosave, conflicts, versions, read-only)
npm run fake-llm &                     # fake model (OpenAI-compatible API, scripted tool calls)
npm run dev > dev.log &
npm run e2e                            # end to end (Playwright Test, e2e/*.spec.mjs): agent chat and approvals, the agent making looks, shared look libraries, sharing and comments, email/password sign-in (OTP codes read from dev.log), the English UI, dragging in the plan, the API permission matrix, version history
npx playwright test permissions        # one file; the servers above are reused, or started by the config when not running
```

## Deployment (Cloudflare Workers free plan, via GitHub Actions)

`.github/workflows/deploy.yml`:
- Pull requests and pushes: four parallel jobs — `core` (typecheck + tests), `lint` (oxlint, oxfmt, theme color and i18n checks), `web` (build + typecheck + unit tests), `api` (the permission matrix and version history against a local Worker, with Playwright Test).
- Pushes to `main`: after the checks pass, migrate the remote D1 database → deploy → sync the secrets below to the Worker. Until the Cloudflare secrets are set, the deploy job is skipped with a warning.

The D1 database `plinth` already exists (its ID is in `apps/web/wrangler.jsonc`); the token must belong to the same Cloudflare account.

### GitHub configuration

Repository Settings → Secrets and variables → Actions:

**Secrets**

| Name | Notes |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Required. Cloudflare → My Profile → API Tokens → Create Token, use the "Edit Cloudflare Workers" template and add Account → D1 → Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Required. Shown on the right of the Workers & Pages page in the Cloudflare dashboard |
| `BETTER_AUTH_SECRET` | Required. Signs sign-in sessions; a random string of 32+ characters (`openssl rand -base64 32`) |
| `KEY_ENCRYPTION_SECRET` | Required. Encrypts users' model API keys; a random string of 24+ characters. **Never change it once set** — saved model keys can no longer be decrypted |
| `RESEND_API_KEY` | Needed for email sign-in. Sends OTP codes (resend.com; free tier: 100 emails/day) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional. Redirect URI: `<site URL>/api/auth/callback/google` |

**Variables**

| Name | Notes |
|---|---|
| `MAIL_FROM` | Needed for email sign-in. Sender, e.g. `Plinth <noreply@your-domain>`; the domain must be verified in Resend |
| `APP_URL` | Optional. Set it when using a custom domain, e.g. `https://plinth.example.com`; otherwise it's inferred from the request URL |

### Sign-in methods

- OTP: enter an email and receive a code; an account is created if none exists.
- Email + password: verify the email with an OTP after sign-up; reset a forgotten password with an OTP (accounts that only ever used OTP can set a password this way).
- Google (optional).

The slow password hash runs on the user's device (PBKDF2-SHA256, 600,000 iterations, salt `plinth:` + email). The server receives the derived value and stores a random salt + one SHA-256 of it. A free-plan Worker gets 10 ms CPU per request, too little for a slow hash; as a side effect the raw password never leaves the device.

All OTP emails go through Resend. Without `RESEND_API_KEY` + `MAIL_FROM`, production still offers email + password (sign-up signs in directly, no email verification), Google and guest trial; OTP sign-in and password reset are hidden until mail is configured. Locally the codes are printed to the terminal.

Once configured, push to `main` or run the `deploy` workflow manually from the Actions page. After the first deploy the site is at `https://plinth.<your-subdomain>.workers.dev`.
