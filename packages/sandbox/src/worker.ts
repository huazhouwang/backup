/** The browser host's worker script: bundle it as a self-contained classic script (IIFE; Vite: `?worker&url` with `worker.format: 'iife'`) and pass its URL to createBrowserSandbox */
import { serve } from './serve.js';

serve(self as unknown as { onmessage: ((e: MessageEvent) => void) | null });
