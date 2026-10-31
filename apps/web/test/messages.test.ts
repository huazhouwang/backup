import { readFileSync } from 'node:fs'

import { expect, test } from 'vitest'

type Messages = Record<string, unknown>

/** A message file: `key: "text {param}"`, or a list of variants with declarations and matches. */
function load(locale: string): Messages {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
  )
  if (typeof parsed !== 'object' || parsed === null) throw new Error(`${locale}.json`)
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== '$schema'))
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].flatMap((match) => (match[1] ? [match[1]] : []))

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined

/** The inputs a message takes: its placeholders, or a variant message's declared inputs. */
function params(message: unknown): string[] {
  const names = new Set<string>()
  if (typeof message === 'string') placeholders(message).forEach((name) => names.add(name))
  for (const variant of Array.isArray(message) ? message : []) {
    const declarations = field(variant, 'declarations')
    const locals = new Set<string>()
    for (const declaration of Array.isArray(declarations) ? declarations : []) {
      const [kind, name] = String(declaration).split(/\s+/)
      if (kind === 'input' && name) names.add(name)
      if (kind === 'local' && name) locals.add(name)
    }
    const match = field(variant, 'match')
    for (const text of Object.values(typeof match === 'object' && match !== null ? match : {})) {
      for (const name of placeholders(String(text))) if (!locals.has(name)) names.add(name)
    }
  }
  return [...names].toSorted()
}

const en = load('en')
const zh = load('zh-CN')

test('both locales have the same messages', () => {
  expect(Object.keys(zh).toSorted()).toEqual(Object.keys(en).toSorted())
})

test.each(Object.keys(en))('%s takes the same parameters in both locales', (key) => {
  expect(params(zh[key])).toEqual(params(en[key]))
})
