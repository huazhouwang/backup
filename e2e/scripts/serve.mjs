// Serves the built app with a fresh local API for the end-to-end tests: applies the D1
// migrations to a throwaway state directory, seeds two users with sessions, then runs
// `wrangler dev` in the foreground (Playwright stops it when the run ends).
import { spawn, execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PORT, SECRET, SESSIONS } from '../support/env.mjs'

const api = fileURLToPath(new URL('../../apps/api', import.meta.url))
const state = fileURLToPath(new URL('../.wrangler-state', import.meta.url))
rmSync(state, { recursive: true, force: true })

const wrangler = (args, opts = {}) =>
  execFileSync('pnpm', ['exec', 'wrangler', ...args], { cwd: api, stdio: 'inherit', ...opts })

wrangler(['d1', 'migrations', 'apply', 'lullabo-db', '--local', '--persist-to', state])
const now = Date.now()
const expires = now + 86_400_000
const users = SESSIONS.map(
  (s) => `('${s.userId}','${s.name}','${s.email}',1,${now},${now})`,
).filter((row, i, rows) => rows.indexOf(row) === i)
const sessions = SESSIONS.map(
  (s) => `('${s.token}-id',${expires},'${s.token}','${s.userId}',${now},${now})`,
)
wrangler([
  'd1',
  'execute',
  'lullabo-db',
  '--local',
  '--persist-to',
  state,
  '--command',
  `insert into user (id,name,email,email_verified,created_at,updated_at) values ${users.join(',')};` +
    `insert into session (id,expires_at,token,user_id,created_at,updated_at) values ${sessions.join(',')};`,
])

const dev = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    // No remote bindings (Workers AI): the tests stand in for them and run without an account.
    '--local',
    '--port',
    String(PORT),
    '--persist-to',
    state,
    '--var',
    `BETTER_AUTH_URL:http://localhost:${PORT}`,
    '--var',
    `BETTER_AUTH_SECRET:${SECRET}`,
  ],
  { cwd: api, stdio: 'inherit' },
)
const stop = () => dev.kill('SIGTERM')
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
dev.on('exit', (code) => process.exit(code ?? 0))
