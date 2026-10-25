import { defineConfig, devices } from '@playwright/test'

import { BASE_URL } from './support/env.mjs'

/**
 * End-to-end tests against the built app and a local API (scripts/serve.mjs). Build the web
 * app first (`pnpm build`); CI runs these in the Playwright container so screenshots match
 * the committed baselines.
 */
export default defineConfig({
  testDir: './tests',
  // The tests share one local database; running them in parallel would mix their data.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Font rasterisation differs by a few pixels between machines; layout changes don't.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: BASE_URL,
    ...devices['iPhone 13'],
    // Chromium only: WebKit isn't installed in this setup.
    browserName: 'chromium',
    // A stand-in microphone (a steady tone) that needs no permission prompt.
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
