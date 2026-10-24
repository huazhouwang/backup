// End-to-end tests (e2e/*.spec.mjs) against the dev server, with the fake model for the agent. Locally the servers you already
// run are reused (start them as the README's "Testing" says); otherwise they are started here. Tests run one at a time: they
// share the local database and the fake model's scripted replies.
import { defineConfig } from '@playwright/test';

process.env.DEV_LOG ??= 'dev.log';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  timeout: 10 * 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE ?? 'http://localhost:3000',
    launchOptions: { executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    { command: 'npm run fake-llm', port: 8787, reuseExistingServer: true },
    { command: 'npm run dev > dev.log 2>&1', url: 'http://localhost:3000/api/me', reuseExistingServer: true, timeout: 120_000 },
  ],
});
