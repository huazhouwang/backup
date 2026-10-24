import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Frontend: a TanStack Router SPA, built to static assets.
 * Server: the Worker contains only Hono (/api/*), no React, keeping bundle size and cold start small enough for the free plan's 3 MB / 10 ms limits.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 3000 },
  build: { sourcemap: false },
  // Minify the Worker environment too (named after `name` in wrangler.jsonc): faster parsing on cold start
  environments: { plinth: { build: { minify: true } } },
  plugins: [
    // UI text lives in messages/{locale}.json. Chinese is the base locale and the default;
    // a choice made in the language switcher is kept in localStorage and a cookie (so the Worker
    // can answer in the same language). No locale prefix in URLs.
    paraglideVitePlugin({ project: './project.inlang', outdir: './src/paraglide', strategy: ['localStorage', 'cookie', 'baseLocale'] }),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
    cloudflare(),
  ],
});
