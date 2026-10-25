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
    key: 'elsewhere',
    token: 'e2e-elsewhere',
    userId: 'e2e-elsewhere',
    name: '爸爸',
    email: 'elsewhere@example.com',
  },
]
