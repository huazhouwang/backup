import { describe, expect, test } from 'vitest'

import { getLocale, localeName, localeShortName, locales } from '../src/lib/i18n'
import { m } from '../src/paraglide/messages.js'

describe('runtime', () => {
  test('English is the base locale, Chinese the other', () => {
    expect(locales).toEqual(['en', 'zh-CN'])
    expect(getLocale()).toBe('en')
  })

  test('plurals and parameters', () => {
    expect(m.accountsCount({ count: 1 })).toBe('1 account')
    expect(m.accountsCount({ count: 3 })).toBe('3 accounts')
    expect(m.accountsCount({ count: 3 }, { locale: 'zh-CN' })).toBe('3 个账户')
  })

  test('languages are named in their own language', () => {
    expect(localeName('en')).toBe('English')
    expect(localeName('zh-CN')).toBe('中文')
    expect(localeShortName('en')).toBe('EN')
    expect(localeShortName('zh-CN')).toBe('中文')
  })
})
