// Loaded by the generated service worker (scripts/generate-sw.mjs). Shows reminders sent by
// the server (apps/api/src/reminders.ts) and opens the app when one is tapped.
self.addEventListener('push', (event) => {
  let message = { title: 'Lullabo', body: '', tag: 'bobo', url: '/' }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    // Not JSON: show the defaults.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows[0]
      if (open) {
        await open.focus()
        if (open.url !== url) await open.navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
