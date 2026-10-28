// E2E (issue 186): "从零开始" opens an interview; the agent asks one question at a time with answers to tap, the brief card fills
// in, and the agent ends by generating houses and building the one picked. The model is real, through the test model bridge
// (live with E2E_MODEL=bridge and a subagent answering; replayed from the cassettes otherwise). This test plays the homeowner:
// it taps the options its persona would, and leaves the rest to the agent.
import { test } from '@playwright/test';
import { join } from 'node:path';
import { serve } from './model-bridge.mjs';
import { BASE, OUT, check } from './support.mjs';

const PORT = 8789;
const LIVE = process.env.E2E_MODEL === 'bridge';

/** Each persona: what it taps when an option mentions it (in order of preference), otherwise "你来定" */
const PERSONAS = {
  couple: { prefer: [/两口|2 ?人|夫妻|情侣/, /一层|1 ?层|平层/, /现代|简约/, /书房|办公/, /开放/, /不知道|还没|不确定/, /方案一|第一|^A/] },
  'three-generations': {
    prefer: [
      /三代|6 ?人|六口|老人|5 ?人|五口/,
      /两层|2 ?层|二层/,
      /中式|新中式/,
      /老人房|一楼|一层/,
      /神位|佛龛/,
      /封闭|中式厨房/,
      /不知道|还没|不确定/,
      /方案一|第一|^A/,
    ],
  },
  'you-decide': { prefer: [/方案一|第一|^A/] },
};

for (const [persona, { prefer }] of Object.entries(PERSONAS))
  test(`interview: ${persona}`, async ({ browser: b }) => {
    test.setTimeout(LIVE ? 40 * 60_000 : 5 * 60_000);
    const bridge = await serve(PORT, {
      mode: LIVE ? 'live' : 'replay',
      cassette: join(import.meta.dirname, 'cassettes', `interview-${persona}.json`),
      timeout: LIVE ? 1200 : 5,
    });
    try {
      // E2E_VIDEO=1 records the run for review
      const viewport = { width: 1400, height: 900 };
      const ctx = await b.newContext({
        viewport,
        ...(process.env.E2E_VIDEO ? { recordVideo: { dir: `${OUT}/video-interview-${persona}`, size: viewport } } : {}),
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      let started = 0,
        finished = 0;
      const isChat = r => /\/projects\/[^/]+\/chat$/.test(r.url());
      page.on('request', r => isChat(r) && started++);
      page.on('requestfinished', r => isChat(r) && finished++);
      page.on('requestfailed', r => isChat(r) && finished++);

      // A guest with the bridge as their model, then 从零开始 from the home page
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /打开样例方案/ }).click();
      await page.waitForURL(/\/p\//);
      await page.evaluate(
        port =>
          fetch('/api/keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'compatible', model: 'bridge', apiKey: 'sk-bridge-0000', baseUrl: `http://127.0.0.1:${port}/v1` }),
          }),
        PORT,
      );
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /从零开始/ }).click();
      await page.waitForURL(/start=interview/);
      await page.waitForFunction(() => window.artifact?.ready);

      // Answer questions until a house is built and the agent has finished its turn
      const card = page.locator('[aria-label="agent 的提问"]');
      const questions = [];
      let briefShown = false;
      for (let quiet = 0; ; await page.waitForTimeout(500)) {
        if (!briefShown && (await page.locator('[aria-label="需求清单"]').isVisible())) {
          briefShown = true;
          await page.screenshot({ path: `${OUT}/interview-${persona}-2-brief.png` });
        }
        if (await card.isVisible()) {
          const q = await card.locator('[data-slot="card-title"]').innerText();
          const labels = await card.locator('[data-slot="card-content"] button').allInnerTexts();
          const pick = prefer.map(re => labels.findIndex(l => re.test(l))).find(i => i >= 0);
          questions.push(`${q} → ${pick === undefined ? '你来定' : labels[pick].split('\n')[0]}`);
          if (questions.length === 1) await page.screenshot({ path: `${OUT}/interview-${persona}-1-question.png` });
          if (pick === undefined) await card.getByRole('button', { name: '你来定' }).click();
          else {
            await card.locator('[data-slot="card-content"] button').nth(pick).click();
            if (await card.getByRole('button', { name: '就这些' }).isVisible()) await card.getByRole('button', { name: '就这些' }).click();
          }
          quiet = 0;
          continue;
        }
        // The houses offered as cards (house_choose): the homeowner picks the first
        const options = page.locator('[aria-label="可选的方案"]');
        if (await options.isVisible()) {
          questions.push('(the houses as cards) → 选这个');
          await page.screenshot({ path: `${OUT}/interview-${persona}-2b-options.png` });
          await options.getByRole('button', { name: '选这个' }).first().click();
          quiet = 0;
          continue;
        }
        // Confirmation cards (an action the policy asks about): the homeowner agrees
        const approve = page.getByRole('button', { name: '同意' });
        if (await approve.first().isVisible()) {
          await approve.first().click();
          quiet = 0;
          continue;
        }
        const built = await page.evaluate(() => window.artifact.project().walls.length > 0);
        quiet = started > 0 && started === finished ? quiet + 1 : 0;
        if (built && quiet >= 8) break;
        if (questions.length > 12) break;
      }
      console.log(`questions (${questions.length}):\n  ${questions.join('\n  ')}`);
      const p = await page.evaluate(() => window.artifact.project());
      check(questions.length >= 2 && questions.length <= 9, `asked ${questions.length} questions, one at a time (at most 8, plus picking an option)`);
      check(briefShown, 'the brief card filled in during the interview');
      check(!!p.brief.program && p.brief.program.rooms.length > 0, `the brief holds a room program (${p.brief.program?.rooms.map(r => r.type).join(', ')})`);
      check(p.walls.length > 8 && p.spaces.length > 3, `a house was built (${p.spaces.length} spaces, ${p.walls.length} walls)`);
      const rules = await page.evaluate(() => window.artifact.call('check_rules', {}));
      check(rules.result.issues.filter(i => i.severity === 'error').length === 0, 'the house has no rule errors');
      await page.screenshot({ path: `${OUT}/interview-${persona}-3-built.png` });
      check(errors.length === 0, `no page errors ${errors.slice(0, 3).join(' | ')}`);
      await ctx.close();
    } finally {
      bridge.close();
    }
  });
