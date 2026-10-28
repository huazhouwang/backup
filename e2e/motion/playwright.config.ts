import { defineConfig } from '@playwright/test'

import base from '../playwright.config'
import { BASE_URL } from '../support/env.mjs'

/**
 * Motion regression for the bottom sheet: every scenario is recorded on video and frozen at
 * fixed points of its animations, so two builds can be compared frame by frame
 * (`scripts/compare-motion.py`). Not part of CI: run by hand around changes to sheets.
 *
 *   MOTION_OUT=<dir> pnpm exec playwright test -c motion
 */
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: '*.motion.ts',
  outputDir: `${process.env.MOTION_OUT ?? 'motion-results'}/videos`,
  use: { ...base.use, video: { mode: 'on', size: { width: 390, height: 844 } } },
  // As the main config's, with the server script's path from this folder.
  webServer: {
    command: 'node ../scripts/serve.mjs',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
