import { fileURLToPath } from 'node:url';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';

/** Unit tests for browser-side logic (editor store, plan geometry). They run in Node; the Worker and the UI are covered by e2e. */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Same options as vite.config.ts: both compile into src/paraglide
  plugins: [paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide', strategy: ['localStorage', 'cookie', 'baseLocale'] })],
  test: { include: ['src/**/*.test.ts'] },
});
