import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

/**
 * `virtual:sandbox-worker`: the sandbox's worker (packages/sandbox/src/worker.ts) bundled as a classic script, as a string. The
 * browser sandbox starts it from an opaque-origin iframe, where a module worker can't load, so Vite's own worker bundling (a
 * module in dev) doesn't fit. Built the same way in dev and in production.
 */
function sandboxWorker(): Plugin {
  const id = 'virtual:sandbox-worker';
  const here = fileURLToPath(new URL('.', import.meta.url));
  const entry = resolve(here, '../../packages/sandbox/src/worker.ts');
  return {
    name: 'opensu-sandbox-worker',
    resolveId: source => (source === id ? `\0${id}` : undefined),
    async load(source) {
      if (source !== `\0${id}`) return;
      const out = await build({
        entryPoints: [entry],
        absWorkingDir: here,
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        minify: true,
        metafile: true,
      });
      for (const file of Object.keys(out.metafile.inputs)) this.addWatchFile(resolve(here, file));
      return `export default ${JSON.stringify(out.outputFiles[0].text)};`;
    },
  };
}

/**
 * `virtual:canvas-wheels`: the wheels (src/wheels/index.ts), bundled as one ES module, as a string. The sandboxed canvas page
 * (#171) gets it inlined under the import name `opensu`; it can't load the app's own modules from its opaque origin. Paths
 * resolve through tsconfig.json (`@/…`).
 */
function canvasWheels(): Plugin {
  const id = 'virtual:canvas-wheels';
  const here = fileURLToPath(new URL('.', import.meta.url));
  return {
    name: 'opensu-canvas-wheels',
    resolveId: source => (source === id ? `\0${id}` : undefined),
    async load(source) {
      if (source !== `\0${id}`) return;
      const out = await build({
        entryPoints: [resolve(here, 'src/wheels/index.ts')],
        absWorkingDir: here,
        tsconfig: resolve(here, 'tsconfig.json'),
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        jsx: 'automatic',
        minify: true,
        metafile: true,
        define: { 'process.env.NODE_ENV': '"production"' },
      });
      for (const file of Object.keys(out.metafile.inputs)) this.addWatchFile(resolve(here, file));
      return `export default ${JSON.stringify(out.outputFiles[0].text)};`;
    },
  };
}

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
    sandboxWorker(),
    canvasWheels(),
  ],
});
