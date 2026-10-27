// Shared by the server script and the tests.
export const PORT = 8812
export const BASE_URL = `http://localhost:${PORT}`
/** Test-only signing secret for session cookies; never used outside this local server. */
export const SECRET = 'e2e-secret-e2e-secret-e2e-secret-1234'

/**
 * Seeded sessions. Each test that signs in has its own users, so one test's families never
 * show up in another's. `syncA`/`syncB` are the same account on two devices.
 */
export const SESSIONS = [
  {
    key: 'syncA',
    token: 'e2e-sync-a',
    userId: 'e2e-sync',
    name: '测试家长',
    email: 'sync@example.com',
  },
  {
    key: 'syncB',
    token: 'e2e-sync-b',
    userId: 'e2e-sync',
    name: '测试家长',
    email: 'sync@example.com',
  },
  {
    key: 'owner',
    token: 'e2e-owner',
    userId: 'e2e-owner',
    name: '测试家长',
    email: 'owner@example.com',
  },
  {
    key: 'grandma',
    token: 'e2e-grandma',
    userId: 'e2e-grandma',
    name: '外婆',
    email: 'grandma@example.com',
  },
  {
    key: 'visual',
    token: 'e2e-visual',
    userId: 'e2e-visual',
    name: '测试家长',
    email: 'visual@example.com',
  },
  {
    key: 'voice',
    token: 'e2e-voice',
    userId: 'e2e-voice',
    name: '测试家长',
    email: 'voice@example.com',
  },
  {
    key: 'tipAsk',
    token: 'e2e-tip-ask',
    userId: 'e2e-tip-ask',
    name: '测试家长',
    email: 'tip-ask@example.com',
  },
  {
    key: 'micExplain',
    token: 'e2e-mic-explain',
    userId: 'e2e-mic-explain',
    name: '测试家长',
    email: 'mic-explain@example.com',
  },
  {
    key: 'micOnce',
    token: 'e2e-mic-once',
    userId: 'e2e-mic-once',
    name: '测试家长',
    email: 'mic-once@example.com',
  },
  {
    key: 'micDenied',
    token: 'e2e-mic-denied',
    userId: 'e2e-mic-denied',
    name: '测试家长',
    email: 'mic-denied@example.com',
  },
  {
    key: 'tabMic',
    token: 'e2e-tab-mic',
    userId: 'e2e-tab-mic',
    name: '测试家长',
    email: 'tab-mic@example.com',
  },
  {
    key: 'tabMicHints',
    token: 'e2e-tab-mic-hints',
    userId: 'e2e-tab-mic-hints',
    name: '测试家长',
    email: 'tab-mic-hints@example.com',
  },
  {
    key: 'micRetake',
    token: 'e2e-mic-retake',
    userId: 'e2e-mic-retake',
    name: '测试家长',
    email: 'mic-retake@example.com',
  },
  {
    key: 'elsewhere',
    token: 'e2e-elsewhere',
    userId: 'e2e-elsewhere',
    name: '爸爸',
    email: 'elsewhere@example.com',
  },
]
