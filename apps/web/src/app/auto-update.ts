/** How long after opening, or coming back to, the app an update may still apply on its own. */
export const FRESH_MS = 10_000

export interface Moment {
  /** The app is on screen. */
  visible: boolean
  /** Since it opened or last came back to the foreground (ms). */
  sinceFresh: number
  /** Tapped or typed in since then. */
  touched: boolean
  /** Something a reload would cut short is under way: a sheet, typing, speaking, a sound. */
  busy: boolean
}

/**
 * Whether a waiting update may apply now, reloading the app: only while it has just opened or
 * come back, before anyone has started doing anything with it.
 */
export const mayApplyUpdate = ({ visible, sinceFresh, touched, busy }: Moment) =>
  visible && !touched && sinceFresh < FRESH_MS && !busy
