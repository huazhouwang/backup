import { cn } from '@lullabo/ui/utils'

/** The microphone; held down it looks pressed, like the tab bar's under the finger. */
export const micLook = (pressed: boolean) =>
  cn(
    'flex size-16 touch-none items-center justify-center rounded-full bg-primary text-primary-foreground select-none [-webkit-touch-callout:none]',
    'transition-[translate,box-shadow] duration-75',
    // The darker edge sits inside the white ring, so nothing peeks out below it.
    pressed
      ? 'translate-y-[3px] shadow-[0_0_0_4px_var(--color-background)]'
      : 'shadow-[inset_0_-5px_0_var(--color-primary-edge),0_0_0_4px_var(--color-background)] active:translate-y-[3px] active:shadow-[0_0_0_4px_var(--color-background)]',
  )
