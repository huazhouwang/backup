# Siri voice logging

Say "嘿 Siri，记录宝宝", then what happened ("小米粒换尿布了，还喝了 120 毫升奶"). Lullabo records
it, says what it did and asks "还有吗？". Ask about records ("上次喂奶是几点"), change or delete
them, or say "没有了" to finish.

## How it works

1. The **Shortcuts** shortcut asks "要记录什么？" and sends the answer to
   `POST /api/voice/siri`, with the user's code in the `Authorization` header.
2. The server runs an agent with TanStack AI (`apps/api/src/agent/`). It has tools to list the
   babies, find records, record, update, delete, undo and end the conversation.
3. Writes go through the same checks and SQL as a sync push (`agent/data.ts`), so every device
   gets them on its next pull.
4. The answer is `{ ok, done, confirming, reply }`, always with status 200. Siri reads `reply`,
   and the shortcut asks again until `done` is set.

### The conversation

- Each user has one conversation, stored in D1 with TanStack AI persistence
  (`agent/persistence.ts`). Long ones are compacted (`withCompaction`).
- After 30 idle minutes the next message starts a new one. So does a change of key (own or
  shared, and which family's): what was said with one key never goes to another key's provider.
- Settings → Siri 语音记录 → 试一下 opens the same conversation as a chat box. What is said
  there is really recorded.
- Updating a record happens at once: the agent says what changed (before → after), and
  "撤销" changes it back. Deleting needs approval (`needsApproval`). Siri asks
  "要删除「…」吗？", and the same model reads the reply, in any words or language: yes
  approves it, no refuses it. Anything else, such as a correction, refuses it and is handled as
  a new message.
- "撤销" reverts the latest change of the conversation (`voice_ops`).
- Conversations are kept 30 days after they were last used: once an hour the cron deletes
  older ones with their runs, pending questions and undo log (`agent/retention.ts`).

### Misheard values

- Each turn's instructions give every baby its age, the usual values for that age
  (`agent/guide.ts`, with sources), and its own last 7 days of feeds.
- When a value looks misheard ("十五" for "五十", solids at two months), the agent asks one
  short question with the likely value, and records with `confirmed: true` once the parent
  agrees. Plausible values are recorded directly.
- The server backs this up: without `confirmed`, `record` and `update_event` refuse values past
  hard limits for the age (`implausible` in `agent/guide.ts`) and tell the agent to ask.

### Evals

Unit tests use a scripted model, so they show the tools and checks work, not that a real model
decides well. `apps/api/evals` plays scenarios (misheard, plausible, ask-then-answer) against
real models, several runs each, and reports pass rates by model and category with every
failure.

- In GitHub: Actions → Agent evals → Run workflow (models, runs and a name filter are inputs).
  It also runs every Monday. It needs the `EVAL_OPENROUTER_API_KEY` secret (or
  `EVAL_OPENAI_API_KEY`), and skips without one. The report is in the run summary.
- Locally: `EVAL_OPENROUTER_API_KEY=… pnpm --filter @bobo/api eval`, with `EVAL_MODELS`,
  `EVAL_RUNS` and `EVAL_ONLY` to narrow it. The report is written to `eval-report.md`.
- Re-run it after changing the instructions, the tools or `agent/guide.ts`, and compare.
- `test/eval-harness.test.ts` keeps the harness itself working in CI.

### Families

One shortcut and one code cover all the user's families. The agent is given the babies the user
may record for and works out the family from the name. A name used in two families gets the
family's name added, as in "小米粒（外婆家）". When it is unclear which baby is meant, the agent
asks. Every write is still checked against the user's role and baby scope.

### Whose AI

Each user can set their own AI under Settings → 我的 AI:

- the provider: OpenAI, or OpenRouter for other vendors' models;
- their API key;
- a model from the key's list. Only models that can use tools are listed.

The key is encrypted with `ENCRYPTION_SECRET` (AES-GCM). Only its last characters are ever shown.

A user can share their AI with any of their families. Members without a key of their own use it
there. When several members share with a family, its owner or admins pick one; by default it is
the earliest. Leaving the family ends the share.

Which key a command uses (`agent/keys.ts`):

1. **The user's own key**, if set. It records in every family where the user is not a viewer.
2. Else **a key shared with one of their families**: the first such family, in the order they
   joined. It records only in that family, so a key is never spent outside the family it was
   shared with.
3. Else voice logging is not available, and the reply says how to set up an AI.

### The code

- One per user, made on the settings page. Only its SHA-256 hash is stored.
- It acts for the user only through the agent's tools.
- It stops working:
  - after 180 days without use (each use extends it);
  - when it is replaced or revoked;
  - when the password changes;
  - when the account is deleted;
  - when the user signs out on the device that made it.
- Limits: 10 requests a minute (`VOICE_RATE_LIMIT`), and 200 messages a day per user across
  Siri and the chat box.

## Setup

### 1. Encryption secret

Add the repository secret `ENCRYPTION_SECRET` (Settings → Secrets and variables → Actions): a random
string of 32+ characters, e.g. from a password manager. Then re-run the deploy. Without it, nobody
can save an AI key. Changing it later makes saved keys unreadable, and users have to enter them
again.

Then, in the app: Settings → 我的 AI → choose a provider, paste a key, pick a model, and share it
with the family if others should use it.

### 2. The shortcut (shared from iCloud)

The settings page's "添加到 Siri" button copies the user's code and opens the shortcut's iCloud
link (`SHORTCUT_URL` in `apps/web/src/features/voice/api.ts`) in Safari: from the installed app
through `x-safari-https://` (iOS 17+), as the app's own window could land on its not-found page.
The Shortcuts app shows its add sheet, which asks for the code ("请粘贴 Lullabo 设置里复制的口令"). The shortcut is shared under the
name `SHORTCUT_NAME` ("记录宝宝", the default phrase); people with another phrase rename it.

To change the shortcut:

1. `node apps/web/scripts/build-shortcut.mjs > 记录宝宝.shortcut` writes it (pass another origin
   to point it at another server). Or edit the shared one in the Shortcuts app.
2. On a device signed in to iCloud: sign it (`shortcuts sign --mode anyone`, a Mac) and add it,
   leaving the code empty; check the import question on the first Text action.
3. Share → Copy iCloud Link, and put the link and the shortcut's name in `api.ts`.

Signing needs a signed-in iCloud account, so it cannot run on CI. Opening a self-hosted file
did not work well: an old service worker served the app instead, Safari only downloaded the
file. The Shortcuts app's `shortcuts://import-shortcut?url=…` link, which would skip Safari,
rejects every URL from a web page ("shortcut URL provided invalid"): tried with the iCloud page,
iCloud's own signed file and that file served by the API.

What the shortcut does:

1. Keeps the code (asked for on import) and the question "要记录什么？".
2. Repeats up to 20 times:
   1. **Ask for Input** with the question;
   2. **Get Contents of URL**: POST `/api/voice/siri`, header `Authorization` with the code, JSON
      body `{ "text": <the answer> }`;
   3. when the reply has `end` (sent only when `done`): **Speak Text** with its `reply`, and
      stop. The If checks that `end` has any value, which compares nothing: an If comparing
      text ("is stop") lost the text on current iOS and failed every run;
   4. otherwise the reply ("记好了，还有吗？", "要删除…吗？") becomes the next question. Ask for
      Input refuses an empty prompt, and speaking the reply first would say it twice.

### 3. Try it

1. Settings → Siri 语音记录 → 试一下, and say something to record.
2. Tap 添加到 Siri, paste the code when Shortcuts asks, and add the shortcut (renaming it if the
   phrase is not 记录宝宝).
3. Say "嘿 Siri，记录宝宝".
4. Optional: iPhone Settings → Accessibility → Touch → Back Tap → Double Tap → the shortcut.
