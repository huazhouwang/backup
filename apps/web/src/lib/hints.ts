import { createStoredValue, jsonCodec, stringList } from './store'

/** Explanations a person can choose not to see again, on this device. */
export type Hint = 'micPermission' | 'vaccineCatchUp'

const hidden = createStoredValue('lullabo.hiddenHints', jsonCodec(stringList), [] as string[])

export const isHintHidden = (hint: Hint) => hidden.get().includes(hint)

export function hideHint(hint: Hint) {
  if (!isHintHidden(hint)) hidden.set([...hidden.get(), hint])
}

/** Every hint shows again: part of clearing this device's cache. */
export const showHintsAgain = () => hidden.set([])
