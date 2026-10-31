import type { SourceKind } from '@folio/shared'

import { m } from '../../paraglide/messages.js'

/** Order and names of source groups in the picker and the accounts list. */
export const KINDS: { kind: SourceKind; label: () => string }[] = [
  { kind: 'wallet', label: m.kindWallet },
  { kind: 'exchange', label: m.kindExchange },
  { kind: 'perp', label: m.kindPerp },
  { kind: 'manual', label: m.kindManual },
]
