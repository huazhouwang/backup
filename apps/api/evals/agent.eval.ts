import { appendFile, writeFile } from 'node:fs/promises'

import { afterAll, beforeAll, expect, it } from 'vitest'

import { AI_PROVIDERS, type AiProvider, aiAdapter, modelOptionsFor } from '../src/ai/providers'
import { createTestApp } from '../test/app'
import { type RunResult, pool, report, runScenario } from './harness'
import { SCENARIOS } from './scenarios'

// Plays every scenario against real models and reports how often each does the right thing.
// Costs real tokens, so it only runs on request:
//   EVAL_OPENROUTER_API_KEY=... pnpm --filter @lullabo/api eval
// EVAL_MODELS picks the models ("provider:model", comma-separated), EVAL_RUNS the runs per
// scenario, EVAL_ONLY a substring of the scenario names to run, EVAL_CONCURRENCY how many play
// at once.

const KEYS: Record<AiProvider, string | undefined> = {
  openrouter: process.env.EVAL_OPENROUTER_API_KEY,
  openai: process.env.EVAL_OPENAI_API_KEY,
}
const MODELS = (process.env.EVAL_MODELS || 'openrouter:deepseek/deepseek-v4.1-flash')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)
const RUNS = Number(process.env.EVAL_RUNS || 3)
const ONLY = process.env.EVAL_ONLY ?? ''
/** Scenarios played at once; 1 for keys with a low rate limit. */
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY || 4)
const REPORT = process.env.EVAL_REPORT || 'eval-report.md'

function parseModel(entry: string) {
  const at = entry.indexOf(':')
  const provider = AI_PROVIDERS.find((name) => name === entry.slice(0, at))
  if (!provider) throw new Error(`Unknown provider in EVAL_MODELS: ${entry}`)
  return { entry, provider, model: entry.slice(at + 1), key: KEYS[provider] }
}

const models = MODELS.map(parseModel)
const runnable = models.filter((model) => model.key)

let t: Awaited<ReturnType<typeof createTestApp>>
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(() => t.dispose())

it.skipIf(runnable.length === 0)(
  'voice agent catches misheard values and records plausible ones',
  async () => {
    const scenarios = SCENARIOS.filter((scenario) => scenario.name.includes(ONLY))
    const tasks = runnable.flatMap(({ entry, provider, model, key }) =>
      scenarios.flatMap((scenario) =>
        Array.from(
          { length: RUNS },
          () => (): Promise<RunResult> =>
            runScenario(
              t,
              aiAdapter(provider, model, key!),
              entry,
              scenario,
              modelOptionsFor(provider, model),
            ),
        ),
      ),
    )
    const results = await pool(tasks, CONCURRENCY)
    const markdown = report(results, RUNS)
    await writeFile(REPORT, markdown)
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown)
    console.log(markdown)
    // The report is the result; this only catches a broken harness (nothing ran).
    expect(results.length).toBe(tasks.length)
  },
  60 * 60_000,
)
