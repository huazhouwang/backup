import { ChartColumn, House, Settings, Wallet } from 'lucide-react'

import { m } from '../paraglide/messages.js'

/** The app's main destinations, shared by the sidebar and the mobile dock. */
export const NAV = [
  { to: '/', label: m.navOverview, icon: House },
  { to: '/accounts', label: m.navAccounts, icon: Wallet },
  { to: '/insights', label: m.navInsights, icon: ChartColumn },
  { to: '/settings', label: m.navSettings, icon: Settings },
] as const
