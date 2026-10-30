import type { BookletDose, VaccineRegion } from '@lullabo/shared'

import { apiFetch } from '../../lib/api'

/** The longest side a booklet photo is sent at: enough for handwriting, small to send. */
const LONGEST_SIDE = 1600
/** The request takes images up to this many characters of data URL (bookletPhotoRequestSchema). */
const MAX_LENGTH = 880_000

/** A photo shrunk and re-encoded as a JPEG data URL small enough to send. */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  // Lower the quality until it fits; a booklet page stays readable well below the first.
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_LENGTH) return url
  }
  throw new Error('photo too large')
}

/** The doses the family's AI reads off a booklet photo. */
export const readBookletPhoto = (babyId: string, region: VaccineRegion, image: string) =>
  apiFetch<{ doses: BookletDose[] }>('/api/vaccines/read', {
    method: 'POST',
    body: JSON.stringify({ babyId, region, image }),
  }).then((reply) => reply.doses)
