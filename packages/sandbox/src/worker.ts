/** The browser host's worker script: bundle it as a self-contained classic script (IIFE) and give its source or URL to createBrowserSandbox */
import { serve } from './serve.js';

serve(self as unknown as { onmessage: ((e: MessageEvent) => void) | null });
