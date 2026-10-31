import { Monitor, Moon, Sun } from 'lucide-react'

import { type ThemePreference, useTheme } from '../lib/theme'
import { m } from '../paraglide/messages.js'

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}
const ICON = { system: Monitor, light: Sun, dark: Moon }
const LABEL = { system: m.themeToggleSystem, light: m.themeToggleLight, dark: m.themeToggleDark }

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { preference, choose } = useTheme()
  const Icon = ICON[preference]
  return (
    <button
      type="button"
      onClick={() => choose(NEXT[preference])}
      aria-label={LABEL[preference]()}
      title={LABEL[preference]()}
      className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  )
}
