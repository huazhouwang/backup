// Paraglide compiler options, shared by the Vite plugin and the `codegen` script.
/** @type {Partial<import('@inlang/paraglide-js').CompilerOptions>} */
export default {
  outdir: './src/paraglide',
  // Client-only SPA: a stored choice wins, then the browser's languages, then English.
  strategy: ['localStorage', 'preferredLanguage', 'baseLocale'],
  localStorageKey: 'folio-locale',
  emitReadme: false,
  emitTsDeclarations: true,
}
