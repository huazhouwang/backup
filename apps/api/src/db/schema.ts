import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Server copies of the shared records (@lullabo/shared). Timestamps are epoch milliseconds.
const syncColumns = {
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  createdBy: text('created_by'),
  /**
   * Server-assigned sync sequence (from sync_seq) of the last accepted write. Pull cursors use
   * it instead of timestamps, which are not monotonic across Worker instances.
   */
  seq: integer('seq').notNull().default(0),
}

export const babies = sqliteTable(
  'babies',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id'),
    name: text('name').notNull(),
    birthDate: text('birth_date').notNull(),
    sex: text('sex', { enum: ['female', 'male', 'unspecified'] }).notNull(),
    avatarColor: text('avatar_color').notNull(),
    archivedAt: integer('archived_at'),
    ...syncColumns,
  },
  (table) => [index('babies_family_seq_idx').on(table.familyId, table.seq, table.id)],
)

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    babyId: text('baby_id').notNull(),
    familyId: text('family_id'),
    type: text('type', {
      enum: [
        'feeding',
        'sleep',
        'diaper',
        'pumping',
        'temperature',
        'medication',
        'note',
        'growth',
      ],
    }).notNull(),
    startAt: integer('start_at').notNull(),
    endAt: integer('end_at'),
    // Type-specific payload, validated with the shared zod schema before writing.
    data: text('data', { mode: 'json' }).notNull(),
    note: text('note'),
    ...syncColumns,
  },
  (table) => [
    index('events_baby_start_idx').on(table.babyId, table.startAt),
    index('events_family_seq_idx').on(table.familyId, table.seq, table.id),
  ],
)

export const families = sqliteTable('families', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const memberships = sqliteTable(
  'memberships',
  {
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'caregiver', 'viewer'] }).notNull(),
    /** 'all' babies of the family, or only those listed in membership_babies. */
    babyScope: text('baby_scope', { enum: ['all', 'selected'] })
      .notNull()
      .default('all'),
    /** The member's private name for the family, shown only to them. */
    alias: text('alias'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.familyId, table.userId] }),
    index('memberships_user_idx').on(table.userId),
  ],
)

export const membershipBabies = sqliteTable(
  'membership_babies',
  {
    familyId: text('family_id').notNull(),
    userId: text('user_id').notNull(),
    babyId: text('baby_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.familyId, table.userId, table.babyId] })],
)

/** Single-use invite links; the code is the secret, so it is long and random. */
export const invites = sqliteTable(
  'invites',
  {
    code: text('code').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'caregiver', 'viewer'] }).notNull(),
    /** JSON array of baby ids, or null for every baby. */
    babyIds: text('baby_ids'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedBy: text('used_by'),
    usedAt: integer('used_at'),
    revokedAt: integer('revoked_at'),
  },
  (table) => [index('invites_family_idx').on(table.familyId)],
)

/** Single-row counter; every accepted push increments it inside the same D1 transaction. */
export const syncSeq = sqliteTable('sync_seq', {
  id: integer('id').primaryKey(),
  value: integer('value').notNull(),
})

/** Web Push subscriptions; one per browser, owned by the user signed in when it subscribed. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
)

/**
 * "It's been a while" reminders a user set for a baby: notify when the latest event of the
 * kind started more than interval_minutes ago. Independent of how notifications are delivered.
 */
export const reminders = sqliteTable(
  'reminders',
  {
    userId: text('user_id').notNull(),
    babyId: text('baby_id').notNull(),
    kind: text('kind', { enum: ['feeding', 'diaper'] }).notNull(),
    intervalMinutes: integer('interval_minutes').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    /** start_at of the event the last reminder was sent for, so each gap notifies once. */
    firedFor: integer('fired_for'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.babyId, table.kind] }),
    index('reminders_enabled_idx').on(table.enabled),
  ],
)

/** Keys the server creates for itself on first use, such as the VAPID key pair. */
export const serverKeys = sqliteTable('server_keys', {
  name: text('name').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at').notNull(),
})

/** The model a user's voice commands use, run with their key for its provider. */
export const userAi = sqliteTable('user_ai', {
  userId: text('user_id').primaryKey(),
  provider: text('provider', { enum: ['openai', 'openrouter'] }).notNull(),
  model: text('model').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/**
 * A user's key for each AI provider, encrypted with ENCRYPTION_SECRET (AES-GCM); only its
 * last characters are kept in clear.
 */
export const userAiKeys = sqliteTable(
  'user_ai_keys',
  {
    userId: text('user_id').notNull(),
    provider: text('provider', { enum: ['openai', 'openrouter'] }).notNull(),
    /** base64url of iv (12 bytes) followed by the ciphertext. */
    keyCipher: text('key_cipher').notNull(),
    keyHint: text('key_hint').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
)

/** A user's AI shared with a family: members without their own record there with it. */
export const aiShares = sqliteTable(
  'ai_shares',
  {
    familyId: text('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.familyId, table.userId] })],
)

/** Which shared AI a family uses, picked by its owner or admins; else the earliest shared. */
export const familyAi = sqliteTable('family_ai', {
  familyId: text('family_id')
    .primaryKey()
    .references(() => families.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/**
 * A user's Siri shortcut: what they say to start it, their time zone, and the chat thread
 * their commands continue (a new one after 30 idle minutes).
 */
export const voiceSettings = sqliteTable('voice_settings', {
  userId: text('user_id').primaryKey(),
  phrase: text('phrase').notNull(),
  timeZone: text('time_zone').notNull(),
  /** The app language the assistant replies in (BCP 47, e.g. "zh-CN"). */
  locale: text('locale').notNull().default('zh-CN'),
  threadId: text('thread_id'),
  threadActiveAt: integer('thread_active_at'),
  /** Whose key and families the thread runs with; a change starts a new thread. */
  threadScope: text('thread_scope'),
  /** Messages on `day` (UTC date) from Siri and the chat box, for the daily cap. */
  day: text('day').notNull().default(''),
  dayCount: integer('day_count').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
})

/**
 * The code a Siri shortcut sends instead of a session: one per user, stored as a SHA-256
 * hash. It lapses after long disuse.
 */
export const voiceTokens = sqliteTable(
  'voice_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    expiresAt: integer('expires_at').notNull(),
    /** Requests on `day` (UTC date), for the daily cap. */
    day: text('day').notNull().default(''),
    dayCount: integer('day_count').notNull().default(0),
  },
  (table) => [
    uniqueIndex('voice_tokens_hash_idx').on(table.tokenHash),
    uniqueIndex('voice_tokens_user_idx').on(table.userId),
  ],
)

/** What each agent turn changed, so "撤销" can put it back. */
export const voiceOps = sqliteTable(
  'voice_ops',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id').notNull(),
    /** One run (agent turn); undo reverts the latest run that changed anything. */
    runId: text('run_id').notNull(),
    eventId: text('event_id').notNull(),
    /** The event as it was, or null when the turn added it. */
    before: text('before'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('voice_ops_thread_idx').on(table.threadId, table.createdAt)],
)

// TanStack AI chat persistence (src/agent/persistence.ts), as its Cloudflare recipe lays out.

export const chatThreads = sqliteTable('chat_threads', {
  threadId: text('thread_id').primaryKey(),
  messagesJson: text('messages_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const chatRuns = sqliteTable(
  'chat_runs',
  {
    runId: text('run_id').primaryKey(),
    threadId: text('thread_id').notNull(),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    error: text('error'),
    errorCode: text('error_code'),
    usageJson: text('usage_json'),
    sandboxKey: text('sandbox_key'),
    detachedSince: integer('detached_since'),
    cancelRequested: integer('cancel_requested'),
    driverEpoch: integer('driver_epoch'),
    parentRunId: text('parent_run_id'),
    subagentRunId: text('subagent_run_id'),
    name: text('name'),
  },
  (table) => [
    index('chat_runs_thread_status').on(table.threadId, table.status),
    index('chat_runs_thread_started').on(table.threadId, table.startedAt),
  ],
)

export const chatInterrupts = sqliteTable(
  'chat_interrupts',
  {
    interruptId: text('interrupt_id').primaryKey(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    status: text('status').notNull(),
    requestedAt: integer('requested_at').notNull(),
    resolvedAt: integer('resolved_at'),
    payloadJson: text('payload_json').notNull(),
    responseJson: text('response_json'),
  },
  (table) => [
    index('chat_interrupts_thread').on(table.threadId, table.requestedAt),
    index('chat_interrupts_run').on(table.runId),
  ],
)

export * from './auth-schema'

/**
 * The AI's observation on a baby's week, written by the family's AI at most once a day (the
 * family's local `day`) and kept for everyone who opens the Tips tab that day.
 */
export const observations = sqliteTable(
  'observations',
  {
    babyId: text('baby_id').notNull(),
    day: text('day').notNull(),
    text: text('text').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.babyId, table.day] })],
)
