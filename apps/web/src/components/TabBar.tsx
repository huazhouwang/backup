import { Link, useHydrated, useLocation } from '@tanstack/react-router'

import { TabMic } from '../features/voice/TabMic'
import { m } from '../paraglide/messages.js'
import { refreshToday } from './PullToRefresh'
import { SettingsIcon, StatsIcon, TipsIcon, TodayIcon } from './ui/TabIcons'

const tabs = [
  { to: '/', label: m.tabToday, Icon: TodayIcon },
  { to: '/stats', label: m.tabStats, Icon: StatsIcon },
  { to: '/tips', label: m.tabTips, Icon: TipsIcon },
  { to: '/settings', label: m.tabSettings, Icon: SettingsIcon },
] as const

export function TabBar() {
  // The tab bar is part of the prerendered SPA shell, which is always rendered for `/`.
  // React keeps mismatched attributes from hydration, so a deep link would keep the
  // shell's active tab. Remounting after hydration recreates the DOM with the real state.
  const hydrated = useHydrated()
  const { pathname } = useLocation()
  // The chat covers the app, tab bar and all.
  if (pathname === '/chat') return null

  return (
    <nav
      key={hydrated ? 'client' : 'shell'}
      className="fixed inset-x-0 bottom-0 z-10 mx-auto flex h-tab-bar-safe max-w-app border-t-2 border-border bg-bg pr-safe-0 pb-safe-0 pl-safe-0"
    >
      {tabs.slice(0, 2).map((tab) => (
        <TabLink key={tab.to} tab={tab} pathname={pathname} />
      ))}
      {/* Talking to the AI, from any page: in the middle and standing out. */}
      <div className="flex flex-1 justify-center">{hydrated && <TabMic />}</div>
      {tabs.slice(2).map((tab) => (
        <TabLink key={tab.to} tab={tab} pathname={pathname} />
      ))}
    </nav>
  )
}

function TabLink({ tab, pathname }: { tab: (typeof tabs)[number]; pathname: string }) {
  return (
    <Link
      to={tab.to}
      // Sub-pages keep their section's tab active.
      activeOptions={{ exact: tab.to === '/' }}
      // Tapping Today again refreshes it, like a pull.
      onClick={tab.to === '/' && pathname === '/' ? refreshToday : undefined}
      className="flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 text-caption font-extrabold text-fg-muted aria-[current=page]:text-primary-text"
    >
      <tab.Icon />
      {tab.label()}
    </Link>
  )
}
