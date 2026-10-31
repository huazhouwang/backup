import { DISPLAY_CURRENCIES, type DisplayCurrency } from '@folio/shared'
import { Button } from '@folio/ui/components/motion/button/base'
import { Input } from '@folio/ui/components/motion/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@folio/ui/components/motion/select'
import { Tabs, TabsList, TabsTrigger } from '@folio/ui/components/motion/tabs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { PageHeader } from '../../components/PageHeader'
import { meQuery, signOut } from '../../features/auth/auth'
import { useMoney } from '../../features/money/queries'
import { useSaveSettings } from '../../features/money/use-save-settings'
import { api } from '../../lib/api'
import { getLocale, localeName, locales, setLocale } from '../../lib/i18n'
import { type ThemePreference, useTheme } from '../../lib/theme'
import { m } from '../../paraglide/messages.js'

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage })

const CURRENCY_NAMES: Record<DisplayCurrency, () => string> = {
  USD: m.currencyUSD,
  EUR: m.currencyEUR,
  GBP: m.currencyGBP,
  JPY: m.currencyJPY,
  CNY: m.currencyCNY,
  HKD: m.currencyHKD,
  SGD: m.currencySGD,
  KRW: m.currencyKRW,
  AUD: m.currencyAUD,
  CAD: m.currencyCAD,
  CHF: m.currencyCHF,
  BTC: m.currencyBTC,
  ETH: m.currencyETH,
}

const THEME_NAMES: Record<ThemePreference, () => string> = {
  light: m.themeLight,
  dark: m.themeDark,
  system: m.themeSystem,
}

const DUST_STEPS = [0, 1, 10, 100] as const

function SettingsPage() {
  const { data: me } = useQuery(meQuery)
  const { settings } = useMoney()
  const save = useSaveSettings()
  const { preference, choose } = useTheme()
  const client = useQueryClient()
  const navigate = useNavigate()

  async function leave() {
    await signOut()
    client.clear()
    await navigate({ to: '/sign-in' })
  }

  return (
    <>
      <PageHeader title={m.navSettings()} subtitle={m.settingsSubtitle()} />
      <div className="flex flex-col gap-5">
        <Section title={m.settingsAccount()}>
          <Row
            label={
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-muted text-xs font-medium uppercase">
                  {me?.email.slice(0, 1)}
                </span>
                <span>
                  <span className="block">{me?.name}</span>
                  <span className="block text-xs text-muted-foreground">{me?.email}</span>
                </span>
              </span>
            }
          >
            <Button variant="outline" size="sm" onClick={() => void leave()}>
              <LogOut className="size-4" /> {m.signOut()}
            </Button>
          </Row>
        </Section>

        <Section title={m.settingsDisplay()}>
          <Row label={m.settingsTheme()}>
            <Tabs
              value={preference}
              onValueChange={(value) =>
                choose(value === 'light' || value === 'dark' ? value : 'system')
              }
              variant="segment"
            >
              <TabsList>
                {(['light', 'dark', 'system'] satisfies ThemePreference[]).map((value) => (
                  <TabsTrigger key={value} value={value}>
                    {THEME_NAMES[value]()}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Row>
          <Row label={m.language()}>
            <Tabs
              value={getLocale()}
              // Saves the choice on this device and reloads the app in that language.
              onValueChange={(value) => {
                const locale = locales.find((candidate) => candidate === value)
                if (locale) void setLocale(locale)
              }}
              variant="segment"
            >
              <TabsList>
                {locales.map((locale) => (
                  <TabsTrigger key={locale} value={locale}>
                    {localeName(locale)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Row>
          <Row label={m.settingsCurrency()} hint={m.settingsCurrencyHint()}>
            <Select
              value={settings.currency}
              onValueChange={(value) => {
                const currency = DISPLAY_CURRENCIES.find((code) => code === value)
                if (currency) save.mutate({ ...settings, currency })
              }}
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {`${code} · ${CURRENCY_NAMES[code]()}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label={m.settingsDust()} hint={m.settingsDustHint()}>
            <Tabs
              value={String(settings.dustUsd)}
              onValueChange={(value) => save.mutate({ ...settings, dustUsd: Number(value) })}
              variant="segment"
            >
              <TabsList>
                {DUST_STEPS.map((step) => (
                  <TabsTrigger key={step} value={String(step)}>
                    {step === 0 ? m.settingsDustAll() : m.settingsDustUnder({ amount: `$${step}` })}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Row>
        </Section>

        <DeleteAccount onDeleted={() => void leave().catch(() => navigate({ to: '/sign-in' }))} />
      </div>
    </>
  )
}

function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const word = m.deleteUserConfirmWord()
  const ready = confirm.trim().toLowerCase() === word.toLowerCase()
  return (
    <Section title={m.deleteUserTitle()}>
      <div>
        <p className="text-sm text-muted-foreground">{m.deleteUserBody()}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label={m.deleteUserConfirm({ word })} value={confirm} onChange={setConfirm} />
          </div>
          <Button
            variant="outline"
            className="text-destructive"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true)
              api('/api/me', { method: 'DELETE' })
                .then(onDeleted)
                .catch(() => setError(m.deleteUserFailed()))
                .finally(() => setBusy(false))
            }}
          >
            {m.deleteUserSubmit()}
          </Button>
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </Section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card/40 p-5 md:p-6">
      <h2 className="mb-4 font-medium">{title}</h2>
      <div className="flex flex-col divide-y divide-border">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">
        {label}
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
