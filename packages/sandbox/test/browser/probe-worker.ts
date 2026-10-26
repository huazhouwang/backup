/** The production worker plus operations that probe its environment (origin, network) or hang it, for the browser host test */
import { serve } from '../../src/serve.js';

serve(self as unknown as { onmessage: ((e: MessageEvent) => void) | null }, req => {
  if (req.op === 'probe')
    return (async () => {
      let network: string;
      try {
        await fetch(String(req.url));
        network = 'allowed';
      } catch {
        network = 'blocked';
      }
      let storage: string;
      try {
        indexedDB.open('probe');
        storage = 'allowed';
      } catch {
        storage = 'blocked';
      }
      return { origin: self.origin, network, storage };
    })();
  if (req.op === 'hang')
    return (async () => {
      for (;;) {
        // A hang in the worker itself, which the engine's deadline can't interrupt
      }
    })();
  return undefined;
});
