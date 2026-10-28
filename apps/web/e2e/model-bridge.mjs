// Test model bridge (issue 184): an OpenAI Chat Completions–compatible server whose answers come from whoever runs
// `bridge next` / `bridge reply` — in practice a Claude subagent acting as the agent's model — so agent tests need no API key.
// Every exchange is recorded to a cassette; BRIDGE_MODE=replay answers from the cassette alone (CI, regression runs).
//
//   node e2e/model-bridge.mjs serve [port=8787]     the server (BRIDGE_MODE=live|replay, BRIDGE_CASSETTE=path.json)
//   node e2e/model-bridge.mjs next [seconds=600]    wait for a pending request, print it; its full JSON is in the printed file
//   node e2e/model-bridge.mjs reply <id> <file|->   answer it: {"text": "...", "tool_calls": [{"name": "...", "arguments": {...}}]}
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DIR = resolve(process.env.BRIDGE_DIR ?? join(import.meta.dirname, '.bridge'));
const PENDING = join(DIR, 'pending');
const ANSWERS = join(DIR, 'answers');
const TAKEN = join(DIR, 'taken');
const wait = ms => new Promise(r => setTimeout(r, ms));

/** Reads stdin or a file */
const readInput = file => (file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8'));

/** An answer is text, tool calls, or both; anything else is refused before it reaches the app */
export function checkAnswer(a) {
  if (!a || typeof a !== 'object') throw new Error('answer must be an object');
  if (a.text !== undefined && typeof a.text !== 'string') throw new Error('text must be a string');
  const calls = a.tool_calls ?? [];
  if (!Array.isArray(calls)) throw new Error('tool_calls must be an array');
  for (const c of calls) {
    if (typeof c?.name !== 'string' || !c.name) throw new Error('each tool call needs a name');
    if (c.arguments !== undefined && (typeof c.arguments !== 'object' || Array.isArray(c.arguments))) throw new Error(`${c.name}: arguments must be an object`);
  }
  if (!a.text && calls.length === 0) throw new Error('answer has neither text nor tool calls');
  return { text: a.text ?? '', tool_calls: calls.map(c => ({ name: c.name, arguments: c.arguments ?? {} })) };
}

/** The text of the latest user message: replay checks it so a cassette can't silently answer a different conversation */
function lastUserText(body) {
  const u = [...(body.messages ?? [])].reverse().find(m => m.role === 'user');
  if (!u) return '';
  return typeof u.content === 'string' ? u.content : (u.content ?? []).map(p => p.text ?? '').join('');
}

const chunk = (delta, finish = null) =>
  `data: ${JSON.stringify({ id: 'bridge', object: 'chat.completion.chunk', created: 0, model: 'bridge', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;

/** Streams an answer the way OpenAI does: text in pieces, then each tool call's name and its arguments */
export function stream(res, answer, seq, usage) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.write(chunk({ role: 'assistant', content: answer.text ? '' : null }));
  for (const part of answer.text.match(/.{1,12}/gsu) ?? []) res.write(chunk({ content: part }));
  answer.tool_calls.forEach((c, index) => {
    res.write(chunk({ tool_calls: [{ index, id: `call_${seq}_${index}`, type: 'function', function: { name: c.name, arguments: '' } }] }));
    res.write(chunk({ tool_calls: [{ index, function: { arguments: JSON.stringify(c.arguments) } }] }));
  });
  res.write(chunk({}, answer.tool_calls.length ? 'tool_calls' : 'stop'));
  res.write(`data: ${JSON.stringify({ id: 'bridge', object: 'chat.completion.chunk', created: 0, model: 'bridge', choices: [], usage })}\n\n`);
  res.end('data: [DONE]\n\n');
}

/** Rough token counts, so usage and credits move like they would with a real model */
function usageOf(body, answer) {
  const prompt = Math.ceil(JSON.stringify(body.messages ?? []).length / 4) + Math.ceil(JSON.stringify(body.tools ?? []).length / 4);
  const completion = Math.ceil((answer.text.length + JSON.stringify(answer.tool_calls).length) / 4);
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/** Starts the server; resolves once it listens. Tests start their own (live when recording, replay otherwise) */
export function serve(port, { mode = 'live', cassette: cassetteFile = null, timeout: seconds = 600 } = {}) {
  const cassettePath = cassetteFile ? resolve(cassetteFile) : null;
  const timeout = seconds * 1000;
  if (mode === 'replay' && !cassettePath) throw new Error('BRIDGE_MODE=replay needs BRIDGE_CASSETTE');
  const cassette = mode === 'replay' ? JSON.parse(readFileSync(cassettePath, 'utf8')) : { exchanges: [] };
  let seq = 0;
  for (const d of [PENDING, ANSWERS, TAKEN]) {
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
  }

  async function answerLive(id, body) {
    // Written aside and renamed, so a reader never sees half a request
    writeFileSync(join(DIR, `${id}.json.tmp`), JSON.stringify({ id, ...body }, null, 2));
    renameSync(join(DIR, `${id}.json.tmp`), join(PENDING, `${id}.json`));
    const file = join(ANSWERS, `${id}.json`);
    for (const end = Date.now() + timeout; Date.now() < end; await wait(100)) {
      if (existsSync(file)) {
        const a = checkAnswer(JSON.parse(readFileSync(file, 'utf8')));
        rmSync(file);
        return a;
      }
    }
    throw new Error(`no answer to request ${id} within ${timeout / 1000} s (run: node e2e/model-bridge.mjs next)`);
  }

  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    if (!req.url.endsWith('/chat/completions')) return void res.writeHead(404).end();
    const body = raw ? JSON.parse(raw) : {};
    const n = seq++;
    const id = String(n).padStart(4, '0');
    try {
      let answer;
      if (mode === 'replay') {
        const ex = cassette.exchanges[n];
        if (!ex) throw new Error(`cassette has no exchange #${n}`);
        if (ex.user !== lastUserText(body)) throw new Error(`exchange #${n} was recorded for "${ex.user}", not "${lastUserText(body)}"`);
        answer = ex.answer;
      } else {
        answer = await answerLive(id, body);
        cassette.exchanges.push({ user: lastUserText(body), tools: (body.tools ?? []).length, hash: hash(body), answer });
        if (cassettePath) {
          mkdirSync(dirname(cassettePath), { recursive: true });
          writeFileSync(cassettePath, JSON.stringify(cassette, null, 2) + '\n');
        }
      }
      console.log(`[bridge] #${id} ${answer.tool_calls.map(c => c.name).join(', ') || JSON.stringify(answer.text.slice(0, 60))}`);
      stream(res, answer, n, usageOf(body, answer));
    } catch (e) {
      console.error(`[bridge] #${id} ${e.message}`);
      res.writeHead(504, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: e.message } }));
    }
  });
  return new Promise(ok =>
    server.listen(port, () => {
      console.log(`[bridge] ${mode} on http://127.0.0.1:${port}/v1${cassettePath ? `, cassette ${cassettePath}` : ''}`);
      ok(server);
    }),
  );
}

const hash = body =>
  createHash('sha256')
    .update(JSON.stringify(body.messages ?? []))
    .digest('hex')
    .slice(0, 16);

/** Prints a request so a reader can answer it: the conversation since the last user turn, the tools by name, and the full file */
function render(file) {
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const msgs = r.messages ?? [];
  const from = Math.max(0, msgs.map(m => m.role).lastIndexOf('user'));
  const show = m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const calls = (m.tool_calls ?? []).map(c => `${c.function.name}(${c.function.arguments})`).join(' ');
    return `[${m.role}${m.tool_call_id ? ` ${m.tool_call_id}` : ''}] ${content ?? ''}${calls ? ` → ${calls}` : ''}`;
  };
  return [
    `request ${r.id}  (${msgs.length} messages, ${(r.tools ?? []).length} tools)  full JSON: ${file}`,
    `tools: ${(r.tools ?? []).map(t => t.function?.name).join(', ')}`,
    from > 0 ? `… ${from} earlier messages (system prompt and history) in the file` : '',
    ...msgs.slice(from).map(show),
  ]
    .filter(Boolean)
    .join('\n');
}

async function next(seconds) {
  for (const end = Date.now() + seconds * 1000; Date.now() < end; await wait(200)) {
    const files = existsSync(PENDING) ? readdirSync(PENDING).sort() : [];
    if (files.length) {
      const taken = join(TAKEN, files[0]);
      renameSync(join(PENDING, files[0]), taken);
      console.log(render(taken));
      return;
    }
  }
  console.log(`no request within ${seconds} s`);
  process.exitCode = 3;
}

function reply(id, file) {
  if (!id || !file) throw new Error('usage: reply <id> <file|->');
  const answer = checkAnswer(JSON.parse(readInput(file)));
  mkdirSync(ANSWERS, { recursive: true });
  writeFileSync(join(ANSWERS, `${id}.json.tmp`), JSON.stringify(answer));
  renameSync(join(ANSWERS, `${id}.json.tmp`), join(ANSWERS, `${id}.json`));
  console.log(`answered ${id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd = 'serve', a, b] = process.argv.slice(2);
  if (cmd === 'serve')
    await serve(Number(a ?? 8787), {
      mode: process.env.BRIDGE_MODE ?? 'live',
      cassette: process.env.BRIDGE_CASSETTE ?? null,
      timeout: Number(process.env.BRIDGE_TIMEOUT ?? 600),
    });
  else if (cmd === 'next') await next(Number(a ?? 600));
  else if (cmd === 'reply') reply(a, b);
  else throw new Error(`unknown command ${cmd}`);
}
