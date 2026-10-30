import { VACCINE_REGIONS, type VaccineRegion } from '@lullabo/shared'

import { m } from '../../paraglide/messages.js'

/** Where a device's time zone suggests the family lives, for a baby with no plan yet. */
const ZONES: readonly [RegExp, VaccineRegion][] = [
  [/^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar)$/, 'cn'],
  [/^Asia\/Singapore$/, 'sg'],
  [/^Europe\/London$/, 'gb'],
  [/^Australia\//, 'au'],
  [
    /^America\/(Toronto|Montreal|Vancouver|Edmonton|Calgary|Winnipeg|Regina|Halifax|St_Johns|Moncton|Whitehorse|Yellowknife|Iqaluit)$/,
    'ca',
  ],
  [
    /^(America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Detroit|Boise|Indiana\/.+|Kentucky\/.+)|Pacific\/Honolulu)$/,
    'us',
  ],
]

export function guessRegion(
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): VaccineRegion {
  const found = ZONES.find(([pattern]) => pattern.test(zone))?.[1]
  return found && VACCINE_REGIONS.includes(found) ? found : 'cn'
}

const NAMES: Record<VaccineRegion, () => string> = {
  cn: m.vaccineRegionCn,
  us: m.vaccineRegionUs,
  gb: m.vaccineRegionGb,
  ca: m.vaccineRegionCa,
  au: m.vaccineRegionAu,
  sg: m.vaccineRegionSg,
}

const SOURCES: Record<VaccineRegion, () => string> = {
  cn: m.vaccineSourceCn,
  us: m.vaccineSourceUs,
  gb: m.vaccineSourceGb,
  ca: m.vaccineSourceCa,
  au: m.vaccineSourceAu,
  sg: m.vaccineSourceSg,
}

export const regionName = (region: VaccineRegion) => NAMES[region]()

/** Where a region's schedule comes from, and that the clinic has the last word. */
export const sourceOf = (region: VaccineRegion) => SOURCES[region]()
