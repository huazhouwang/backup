import { useState } from 'react'

/**
 * Text that animates what changes in it: the part that differs from before (between what the
 * two share at the start and at the end) blurs in, the rest stays still. A corrected word
 * swaps in place; a reply being written fades in as it grows.
 */
export function ChangingText({ text }: { text: string }) {
  const [shown, setShown] = useState({ text, before: text, version: 0 })
  if (shown.text !== text) setShown({ text, before: shown.text, version: shown.version + 1 })
  const { before } = shown
  let start = 0
  while (start < text.length && start < before.length && text[start] === before[start]) start += 1
  let end = 0
  while (
    end < text.length - start &&
    end < before.length - start &&
    text[text.length - 1 - end] === before[before.length - 1 - end]
  ) {
    end += 1
  }
  const changed = text.slice(start, text.length - end)
  if (!changed) return text
  return (
    <>
      {text.slice(0, start)}
      <span key={shown.version} className="animate-text-in">
        {changed}
      </span>
      {text.slice(text.length - end)}
    </>
  )
}

/** Three dots taking turns to hop: something is on its way. */
export const typingDots = (
  <span aria-hidden className="inline-flex h-5 items-center gap-1 align-middle">
    {[0, 150, 300].map((delay) => (
      <span
        key={delay}
        className="size-2 animate-typing rounded-full bg-current"
        style={{ animationDelay: `${delay}ms` }}
      />
    ))}
  </span>
)
