/** The sandbox's worker as a classic script (see sandboxWorker in vite.config.ts) */
declare module 'virtual:sandbox-worker' {
  const source: string;
  export default source;
}

/** The wheels as one ES module (see canvasWheels in vite.config.ts), inlined into the sandboxed canvas page as `plinth` */
declare module 'virtual:canvas-wheels' {
  const source: string;
  export default source;
}
