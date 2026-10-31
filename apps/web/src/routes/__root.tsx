import { APP_NAME } from '@folio/shared'
import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useHydrated,
} from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'

import { getLocale } from '../lib/i18n'
import { themeInitScript } from '../lib/theme'

import appCss from '../styles/app.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: APP_NAME },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  // The prerendered shell holds no page content; pages render after hydration so the first
  // client render matches it.
  const hydrated = useHydrated()
  // The shell is prerendered in English; name the language the app resolved to.
  useEffect(() => {
    document.documentElement.lang = getLocale()
  }, [])
  return hydrated ? <Outlet /> : null
}
