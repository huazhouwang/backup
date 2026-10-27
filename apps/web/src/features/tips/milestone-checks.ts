import { createStoredValue, jsonCodec, stringList, useStore } from '../../lib/store'

/** Milestones ticked off, as "babyId:milestone", on this device only. */
const checked = createStoredValue('lullabo.milestones', jsonCodec(stringList), [] as string[])

const keyOf = (babyId: string, milestone: string) => `${babyId}:${milestone}`

/** Which of a baby's milestones are ticked off, and ticking one on or off. */
export function useMilestoneChecks(babyId: string) {
  const all = useStore(checked)
  return {
    isChecked: (milestone: string) => all.includes(keyOf(babyId, milestone)),
    toggle: (milestone: string) => {
      const key = keyOf(babyId, milestone)
      checked.set(all.includes(key) ? all.filter((other) => other !== key) : [...all, key])
    },
  }
}
