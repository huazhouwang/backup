import { HttpError, apiFetch } from '../../lib/api'
import { getLocale } from '../../lib/i18n'
import type { Startup } from './recorder'

/**
 * The Siri shortcut, shared from iCloud (docs/siri.md). Opening it shows the Shortcuts
 * app's add sheet, which asks for the code once. It is added under this name, the default
 * phrase; people with another phrase rename it.
 */
const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/99bb2773c34f45348e709d24e82c0af9'
export const SHORTCUT_NAME = '记录宝宝'

/**
 * Opens the shortcut's iCloud page in Safari, which hands it to the Shortcuts app. Inside the
 * installed app the page would open in the app's own window and could land on its not-found
 * page, so there it goes to Safari itself (x-safari-https, iOS 17+).
 */
export function openShortcut() {
  const installed =
    matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  window.location.assign(installed ? `x-safari-${SHORTCUT_URL}` : SHORTCUT_URL)
}

export interface VoiceSettings {
  /** What the user says to Siri, i.e. the name they gave the shortcut. */
  phrase: string
  /** The code the shortcut uses, if one is active; the code itself is never shown again. */
  token: { createdAt: number; lastUsedAt: number | null } | null
  /**
   * Whose AI commands use: the user's own (every family), one a family shared (only that
   * family), or none yet.
   */
  ai: { kind: 'own' } | { kind: 'shared'; familyName: string; by: string } | null
}

/** The agent's answer to one message. */
export interface ChatTurn {
  reply: string
  /** The user said they're finished. */
  done: boolean
  /** A change is waiting for the user's yes or no. */
  confirming: boolean
}

export interface ChatMessage {
  /** Stable for a stored message; random for one shown before the server answers. */
  id: string
  /** The conversation it belongs to; null until the server answers. */
  threadId: string | null
  role: 'user' | 'assistant'
  text: string
}

/** A page of the last 30 days of conversations, oldest message first. */
export interface ChatPage {
  lines: ChatMessage[]
  /** When each conversation on the page started. */
  threads: Record<string, { startedAt: number }>
  /** Where the page before this one ends; null at the oldest kept. */
  next: string | null
  /** The conversation the next message continues; null after a pause. */
  activeThreadId: string | null
}

// Codes made on this device, so signing out here can end them (another account may sign in
// next, and the shortcuts would otherwise keep logging for this one).
const TOKEN_IDS_KEY = 'bobo.voiceTokenIds'

function deviceTokenIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(TOKEN_IDS_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function saveDeviceTokenIds(ids: string[]) {
  try {
    if (ids.length > 0) localStorage.setItem(TOKEN_IDS_KEY, JSON.stringify(ids))
    else localStorage.removeItem(TOKEN_IDS_KEY)
  } catch {
    // Storage unavailable: signing out just won't end the codes.
  }
}

/** Ends the codes made on this device that are still the account's current ones. */
export async function revokeThisDeviceToken() {
  const ids = deviceTokenIds()
  await Promise.all(
    ids.map((id) =>
      apiFetch<void>(`/api/voice/tokens/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    ),
  )
  saveDeviceTokenIds([])
}

// Times said aloud ("三点") are read in this device's zone, and the assistant replies in the
// app's language.
const device = () => ({
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale: getLocale(),
})

export const voiceApi = {
  settings: () => apiFetch<VoiceSettings>('/api/voice'),
  rename: (phrase: string) =>
    apiFetch<VoiceSettings>('/api/voice', { method: 'PATCH', body: JSON.stringify({ phrase }) }),
  /** The language Siri's replies are in, when the app's language changes. */
  saveLocale: (locale: string) =>
    apiFetch<VoiceSettings>('/api/voice', { method: 'PATCH', body: JSON.stringify({ locale }) }),
  /** Replaces any earlier code; the old one stops working at once. */
  createToken: async () => {
    const created = await apiFetch<{ id: string; token: string }>('/api/voice/token', {
      method: 'POST',
      body: JSON.stringify(device()),
    })
    saveDeviceTokenIds([...deviceTokenIds(), created.id])
    return created
  },
  revokeToken: () => apiFetch<void>('/api/voice/token', { method: 'DELETE' }),
  /** The latest messages, or those before an earlier page's `next`. */
  chat: (before: string | null) =>
    apiFetch<ChatPage>(
      before ? `/api/voice/chat?before=${encodeURIComponent(before)}` : '/api/voice/chat',
    ),
  /**
   * What was said in a recording (WAV), likely in the app's language: the whole of it, or a
   * `partial` one while the user is still talking. `recent` is the
   * assistant's last line, which it may answer; `startup`, how long recording took to start,
   * is logged to see where the wait goes.
   */
  transcribe: (
    recording: Blob,
    options: { partial?: boolean; recent?: string; startup?: Startup } = {},
  ) =>
    apiFetch<{ text: string | null }>(
      `/api/voice/transcribe?${new URLSearchParams({
        speech: getLocale(),
        ...(options.recent ? { recent: options.recent.slice(0, 300) } : {}),
        ...(options.partial ? { partial: '1' } : {}),
        ...(options.startup
          ? {
              ready: String(options.startup.readyMs),
              mic: options.startup.micMs === null ? 'kept' : String(options.startup.micMs),
            }
          : {}),
      })}`,
      { method: 'POST', body: recording, headers: { 'Content-Type': 'audio/wav' } },
    ),
  /**
   * Sends a message and follows the answer as it is written. A spoken one is corrected
   * first (`heard`), with the chat's `recent` lines as context; the reply then grows
   * (`text`) until the answer is whole.
   */
  stream: async (
    message: { text: string; spoken?: boolean; recent?: string[] },
    on: { heard?: (text: string) => void; text?: (text: string) => void },
  ): Promise<ChatTurn> => {
    const res = await fetch('/api/voice/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...message, ...device() }),
    })
    if (!res.ok || !res.body) throw new HttpError(res.status)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      // A stream is read in order, one part after another.
      // oxlint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      // Server-sent events: blank-line separated, an `event:` and a `data:` line each.
      let end = buffer.indexOf('\n\n')
      while (end !== -1) {
        const fields = Object.fromEntries(
          buffer
            .slice(0, end)
            .split('\n')
            .map((line) => [
              line.slice(0, line.indexOf(':')),
              line.slice(line.indexOf(':') + 1).trim(),
            ]),
        )
        buffer = buffer.slice(end + 2)
        end = buffer.indexOf('\n\n')
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        const data = JSON.parse(fields.data ?? 'null') as { text: string } & ChatTurn
        if (fields.event === 'heard') on.heard?.(data.text)
        if (fields.event === 'text') on.text?.(data.text)
        if (fields.event === 'done') return data
      }
    }
    throw new Error('The answer ended early')
  },
}

/**
 * Copies a code that is still being created. Safari only lets a tap write to the clipboard
 * while the tap is being handled, so the clipboard item is handed over at once and filled in
 * when the server answers.
 */
export async function copyWhenReady(text: Promise<string>) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = text.then((value) => new Blob([value], { type: 'text/plain' }))
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
    return
  }
  await navigator.clipboard.writeText(await text)
}
