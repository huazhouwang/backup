import { clsx } from 'clsx'

export type BunMood = 'asleep' | 'happy' | 'cheer' | 'oops'

const INK = '#3c3c3c'
const CHEEK = '#ffb3c1'

/** The face for each mood; the bun around it is the same. */
function Face({ mood }: { mood: BunMood }) {
  const cheeks = (
    <>
      <circle cx="66" cy="130" r="8" fill={CHEEK} />
      <circle cx="134" cy="130" r="8" fill={CHEEK} />
    </>
  )
  if (mood === 'asleep') {
    return (
      <>
        <path
          d="M72 116q9 8 18 0M110 116q9 8 18 0"
          fill="none"
          stroke={INK}
          strokeWidth="7"
          strokeLinecap="round"
        />
        {cheeks}
        <path
          d="M150 42h14l-14 16h14M170 24h9l-9 11h9"
          fill="none"
          stroke="var(--color-sleep)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    )
  }
  if (mood === 'happy') {
    return (
      <>
        <path
          d="M72 120q9-10 18 0M110 120q9-10 18 0"
          fill="none"
          stroke={INK}
          strokeWidth="7"
          strokeLinecap="round"
        />
        {cheeks}
        <path d="M88 128h24q0 16-12 16t-12-16z" fill={INK} />
        <path d="M94 139q6-5 12 0q-2 5-6 5t-6-5z" fill="#ff7a8a" />
      </>
    )
  }
  if (mood === 'cheer') {
    return (
      <>
        <rect
          x="24"
          y="44"
          width="14"
          height="8"
          rx="2"
          fill="var(--color-feeding)"
          transform="rotate(-25 31 48)"
        />
        <rect
          x="160"
          y="40"
          width="14"
          height="8"
          rx="2"
          fill="var(--color-diaper)"
          transform="rotate(30 167 44)"
        />
        <rect
          x="40"
          y="16"
          width="12"
          height="7"
          rx="2"
          fill="var(--color-sleep)"
          transform="rotate(15 46 19)"
        />
        <circle cx="152" cy="16" r="5" fill="var(--color-moon)" />
        <circle cx="81" cy="112" r="7.5" fill={INK} />
        <circle cx="119" cy="112" r="7.5" fill={INK} />
        <circle cx="83.5" cy="109.5" r="2.5" fill="#ffffff" />
        <circle cx="121.5" cy="109.5" r="2.5" fill="#ffffff" />
        {cheeks}
        <path d="M84 126h32q0 22-16 22t-16-22z" fill={INK} />
        <path d="M92 141q8-6 16 0q-3 7-8 7t-8-7z" fill="#ff7a8a" />
      </>
    )
  }
  return (
    <>
      <circle cx="81" cy="116" r="6" fill={INK} />
      <circle cx="119" cy="116" r="6" fill={INK} />
      {cheeks}
      <path
        d="M88 138q6-6 12 0t12 0"
        fill="none"
        stroke={INK}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M152 68c-6 9-10 14-10 19a10 10 0 0 0 20 0c0-5-4-10-10-19z" fill="#5bc0f8" />
    </>
  )
}

/**
 * The app's mascot, the sleeping bun from the icon, in a few moods: `asleep` while a baby
 * sleeps, `happy` for things done, `cheer` for things worth celebrating, `oops` when
 * something went wrong. Decorative: the words beside it say what happened.
 */
export function Bun({ mood, className }: { mood: BunMood; className?: string }) {
  return (
    <svg aria-hidden viewBox="20 10 170 170" className={clsx('shrink-0', className)}>
      <path
        d="M38 142c0-46 28-78 62-78s62 32 62 78c0 12-9 20-21 20H59c-12 0-21-8-21-20z"
        fill="#e9d9bf"
      />
      <path
        d="M38 136c0-44 28-74 62-74s62 30 62 74c0 10-9 18-21 18H59c-12 0-21-8-21-18z"
        fill="#fffaf0"
        // Outlined, so the cream bun shows on the cream page too.
        stroke="#e2cfae"
        strokeWidth="3"
      />
      <path
        d={mood === 'cheer' ? 'M86 64c-2-16 22-26 30-10' : 'M86 68c0-14 22-20 28-6'}
        fill="none"
        stroke="#e2cfae"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <Face mood={mood} />
    </svg>
  )
}
