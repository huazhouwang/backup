// Paraglide compiler options, shared by the Vite plugin and the `pnpm i18n` CLI.
/** @type {Partial<import('@inlang/paraglide-js').CompilerOptions>} */
export default {
  outdir: './src/paraglide',
  // Client-only SPA: a stored choice wins, then the browser language, then the base locale.
  strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
  localStorageKey: 'lullabo.locale',
  emitReadme: false,
  emitTsDeclarations: true,
}
