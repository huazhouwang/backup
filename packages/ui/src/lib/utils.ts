import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The theme's own scales (styles/ui.css, theme.css, and the app's tab-bar and mic-rise), so
// `text-caption` is a size and not a colour that `text-muted-foreground` would replace.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'body', 'label', 'title', 'display'],
      shadow: ['segment'],
      spacing: ['tab-bar', 'touch', 'mic-rise'],
      container: ['app'],
    },
  },
})

/** Joins class names as clsx does; of two that set the same thing, the later one wins. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs))
}
