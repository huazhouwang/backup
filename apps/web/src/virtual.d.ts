/** The sandbox's worker as a classic script (see sandboxWorker in vite.config.ts) */
declare module 'virtual:sandbox-worker' {
  const source: string;
  export default source;
}
