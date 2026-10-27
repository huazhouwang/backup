import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    // Shown in settings so a report can name the build; CI builds from a commit.
    'import.meta.env.APP_BUILD': JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
    'import.meta.env.APP_BUILT_AT': JSON.stringify(Date.now()),
    // The app's own address, set by the deploy; other addresses serving it point people there.
    'import.meta.env.APP_URL': JSON.stringify(process.env.APP_URL ?? ''),
  },
  server: {
    // In development the API runs in `wrangler dev`; in production both share one origin.
    proxy: { '/api': 'http://localhost:8787' },
  },
  plugins: [
    // Compiler options live in project.inlang/paraglide.config.js.
    paraglideVitePlugin({ project: './project.inlang' }),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          // Emit the shell as index.html so any static host (and later the Capacitor
          // native shell) can serve it without extra configuration.
          outputPath: '/index.html',
        },
      },
    }),
    react(),
  ],
})
