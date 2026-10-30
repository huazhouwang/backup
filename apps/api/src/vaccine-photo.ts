import {
  type AiProvider,
  type BookletDose,
  type VaccineRegion,
  bookletReadingSchema,
  vaccinesOf,
} from '@lullabo/shared'
import { z } from 'zod'

/** What reading a booklet photo needs: the family's AI, the photo and the baby. */
export interface BookletInput {
  provider: AiProvider
  model: string
  apiKey: string
  /** A data URL. */
  image: string
  region: VaccineRegion
  birthDate: string
}

/** Reads a photo into doses; tests pass a fake instead of calling a provider. */
export type BookletReader = (input: BookletInput) => Promise<BookletDose[]>

export class BookletReadError extends Error {}

const ENDPOINT: Record<AiProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
}

/** Models that take images; any other picked model hands the photo to its provider's below. */
const SEES: Record<AiProvider, RegExp> = {
  openai: /^(gpt-(4o|4\.1|5)|o\d)/,
  openrouter:
    /^(openai\/(gpt-(4o|4\.1|5)|o\d)|google\/gemini|anthropic\/claude|meta-llama\/llama-4|qwen\/qwen[\w.-]*vl)/,
}
const SEEING: Record<AiProvider, string> = {
  openai: 'gpt-5.4-mini',
  openrouter: 'openai/gpt-5.4-mini',
}

/** The model to read a photo with: the one picked if it takes images, else one that does. */
export const visionModelFor = (provider: AiProvider, model: string) =>
  SEES[provider].test(model) ? model : SEEING[provider]

/** How the region writes dates, so 03/04 reads the right way round. */
const DATE_ORDER: Record<VaccineRegion, string> = {
  cn: 'year first (2026.05.20, 2026-5-20, 26/5/20 or 2026年5月20日)',
  us: 'month first (05/20/2026)',
  gb: 'day first (20/05/2026)',
  ca: 'year first or day first (2026-05-20, 20/05/2026); English or French month names',
  au: 'day first (20/05/2026)',
  sg: 'day first (20/05/2026 or 20 May 2026)',
}

const months = (age: number) =>
  age === 0 ? 'birth' : age % 12 === 0 && age >= 24 ? `${age / 12}y` : `${age}m`

/** The instructions: the schedule to match against, and what to leave out. */
export function bookletPrompt(region: VaccineRegion, birthDate: string) {
  const schedule = vaccinesOf(region)
    .map((vaccine) =>
      [
        vaccine.id,
        vaccine.name,
        vaccine.local ?? '',
        vaccine.against,
        vaccine.doses.map((dose) => months(dose.months)).join(', '),
      ].join(' | '),
    )
    .join('\n')
  return `You read a child's vaccination record from a photo: a page of a vaccination booklet, a clinic printout or a card, handwritten or printed, in Chinese or English.

List every vaccine dose the page shows as given: one with a date of vaccination. Leave out doses only planned or booked, with no date given, and anything that is not a vaccine.

For each dose give:
- vaccineId: the id of the vaccine on the schedule below that it is, matching the name, abbreviation or brand on the page; null if none of them is.
- name: the vaccine's name as the page writes it, short.
- dose: its number in that vaccine's series (第 2 剂, dose 2, #2, booster after three doses = 4). If the page doesn't number it, count the doses of that vaccine on the page in date order.
- date: the day it was given, YYYY-MM-DD. Dates here are written ${DATE_ORDER[region]}. The child was born on ${birthDate}: no dose is before that, and a two-digit year is the first such year after the birth.

A combined vaccine (五联, 6-in-1, DTaP-IPV-Hib …) is one dose of the combined vaccine on the schedule, not one of each part; so are its parts written on separate lines on the same day (measles, mumps and rubella → one dose of MMR). Skin tests (tuberculin, TB, PPD) are not vaccines. Dates may be written in the margin, sideways or across columns: read them with the row they belong to. Don't guess at what you can't read: leave that dose out.

The schedule (id | name | local name | against | ages of its doses):
${schedule}`
}

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'booklet',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['doses'],
      properties: {
        doses: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['vaccineId', 'name', 'dose', 'date'],
            properties: {
              vaccineId: { type: ['string', 'null'] },
              name: { type: 'string' },
              dose: { type: 'integer' },
              date: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const

/** Reading a page takes a vision model longer than a voice turn. */
const READ_TIMEOUT_MS = 45_000

/** Reads a booklet photo with the family's AI: the doses on it, checked. */
export const readBooklet: BookletReader = async (input) => {
  const model = visionModelFor(input.provider, input.model)
  const reasoning = /^(openai\/)?(gpt-5|o\d)/.test(model)
  const body = {
    model,
    messages: [
      { role: 'system', content: bookletPrompt(input.region, input.birthDate) },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'The vaccination record:' },
          { type: 'image_url', image_url: { url: input.image, detail: 'high' } },
        ],
      },
    ],
    response_format: RESPONSE_FORMAT,
    ...(input.provider === 'openai'
      ? { max_completion_tokens: 8192, ...(reasoning ? { reasoning_effort: 'low' } : {}) }
      : {
          max_tokens: 8192,
          ...(reasoning ? { reasoning: { effort: 'low' } } : {}),
          provider: { require_parameters: true },
        }),
  }
  const res = await fetch(ENDPOINT[input.provider], {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(READ_TIMEOUT_MS),
  })
  if (!res.ok) throw new BookletReadError(`provider answered ${res.status}`)
  const reply: unknown = await res.json()
  return parseReading(reply, input)
}

const replySchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
})
const listSchema = z.object({ doses: z.array(z.unknown()) })

/** The doses in a provider's reply, those that make no sense left out. */
export function parseReading(
  reply: unknown,
  { region, birthDate }: Pick<BookletInput, 'region' | 'birthDate'>,
): BookletDose[] {
  const content = replySchema.safeParse(reply).data?.choices[0]?.message.content
  if (content === undefined) throw new BookletReadError('no reply')
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new BookletReadError('reply is not JSON')
  }
  const doses = listSchema.safeParse(parsed).data?.doses ?? []
  const known = new Map(vaccinesOf(region).map((vaccine) => [vaccine.id, vaccine]))
  const today = new Date().toISOString().slice(0, 10)
  const checked = bookletReadingSchema.shape.doses.element
  return doses.flatMap((raw) => {
    const dose = checked.safeParse(raw).data
    if (!dose || dose.date < birthDate || dose.date > today) return []
    const vaccine = dose.vaccineId ? known.get(dose.vaccineId) : undefined
    // An id not on the schedule, or a dose past its series, is one the family names.
    const onSchedule = vaccine && dose.dose <= vaccine.doses.length
    return [{ ...dose, vaccineId: onSchedule ? vaccine.id : null }]
  })
}
