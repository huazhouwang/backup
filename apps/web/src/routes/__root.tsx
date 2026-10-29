import { APP_NAME } from '@lullabo/shared'
import { useBounce } from '@lullabo/ui/bounce'
import { KeyboardKeeper } from '@lullabo/ui/keyboard'
import { MotionProvider } from '@lullabo/ui/motion'
import { Toaster } from '@lullabo/ui/toast'
import type { QueryClient } from '@tanstack/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useHydrated,
  useRouter,
} from '@tanstack/react-router'
import { type ReactNode, Suspense, useEffect, useRef } from 'react'

import { KeyboardProbe } from '../app/KeyboardProbe'
import { MovedNotice } from '../app/MovedNotice'
import { TabBar } from '../app/TabBar'
import { UpdatePrompt } from '../app/UpdatePrompt'
import { SoundKeeper } from '../features/sounds/SoundKeeper'
import { getLocale } from '../lib/i18n'
import { animatePageChanges } from '../lib/page-change'
import { splashLinks } from '../lib/splash'
import { storageRenameScript } from '../lib/storage-rename'
import { THEME_COLORS, themeInitScript } from '../lib/theme'
import { watchTheme } from '../lib/use-theme'
import { SyncRunner } from '../sync/SyncRunner'

import appCss from '../styles/app.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        // No pinch zoom, and no zoom into a focused field, like an installed app.
        content:
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
      },
      { name: 'theme-color', content: THEME_COLORS.light },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { name: 'apple-mobile-web-app-title', content: APP_NAME },
      { title: APP_NAME },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ...splashLinks,
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The inline theme script sets data-theme before hydration.
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Settings saved under the old name move first, so the theme finds its own. */}
        <script dangerouslySetInnerHTML={{ __html: storageRenameScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

const pageOwnsNot = (target: Element, _axis: unknown, edge: 'start' | 'end') =>
  target.closest('[data-slot=sheet], [data-own-scroll]') !== null ||
  (edge === 'start' && target.closest('[data-pull-to-refresh]') !== null)

function RootLayout() {
  // The prerendered shell never contains page content. Rendering pages only after
  // hydration keeps the first client render identical to the shell; otherwise a page
  // whose data is already available (the local store opens fast) would mismatch.
  const hydrated = useHydrated()
  // The shell is prerendered in the base locale; reflect the resolved locale for
  // screen readers and font selection.
  useEffect(() => {
    document.documentElement.lang = getLocale()
  }, [])
  useEffect(watchTheme, [])
  // iOS Safari only shows :active styles while a touch listener exists somewhere on the page;
  // without one, rows and buttons give no feedback when pressed.
  useEffect(() => {
    const noop = () => undefined
    document.addEventListener('touchstart', noop, { passive: true })
    return () => document.removeEventListener('touchstart', noop)
  }, [])
  // iOS ignores user-scalable=no in Safari; its pinch gesture events can still be cancelled.
  useEffect(() => {
    const cancel = (event: Event) => event.preventDefault()
    document.addEventListener('gesturestart', cancel)
    return () => document.removeEventListener('gesturestart', cancel)
  }, [])

  // The page bounces at its ends. Sheets bounce on their own (Sheet), and on Today the
  // pull-to-refresh owns the top.
  const main = useRef<HTMLElement>(null)
  useBounce(null, { axes: ['y'], content: main, ignore: pageOwnsNot })
  const router = useRouter()
  useEffect(() => (main.current ? animatePageChanges(router, main.current) : undefined), [router])

  return (
    <MotionProvider>
      {/* Clipped across: a page sliding in from the side doesn't widen the app. */}
      <div className="mx-auto flex min-h-dvh max-w-app flex-col overflow-x-clip">
        <main ref={main} className="flex-1 pt-safe-4 pr-safe-4 pb-above-tab-bar pl-safe-4">
          {/* Pages suspend while the local store opens (a few ms on startup). */}
          {hydrated && (
            <Suspense>
              <Outlet />
            </Suspense>
          )}
        </main>
        <TabBar />
        <KeyboardKeeper />
        <Toaster />
        {hydrated && <UpdatePrompt />}
        {hydrated && <KeyboardProbe />}
        {hydrated && <MovedNotice />}
        {hydrated && <SoundKeeper />}
        {hydrated && (
          <Suspense>
            <SyncRunner />
          </Suspense>
        )}
      </div>
    </MotionProvider>
  )
}
