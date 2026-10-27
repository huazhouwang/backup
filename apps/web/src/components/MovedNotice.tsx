import { useEffect } from 'react'

import { movedTo } from '../lib/moved'
import { m } from '../paraglide/messages.js'
import { showToast } from './ui/Toast'

/**
 * Open at an address the app has moved from: says where it lives now, and goes there on
 * a tap. Not on its own: records kept only in this browser (signed out) stay at this
 * address, so moving is the person's choice, after signing in.
 */
export function MovedNotice() {
  useEffect(() => {
    const target = movedTo(import.meta.env.APP_URL, window.location)
    if (!target) return
    showToast(m.appMoved({ host: new URL(target).host }), {
      id: 'moved',
      duration: Infinity,
      action: { label: m.appMovedGo(), onClick: () => window.location.assign(target) },
    })
  }, [])
  return null
}
