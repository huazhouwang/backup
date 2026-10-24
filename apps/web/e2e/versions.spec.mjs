// Version history: an author's quick successive autosaves merge into one version; other authors, restores (checkpoints),
// version 1 and saves after the squash window each keep their own. Needs only the dev server (no browser, no model).
import { execFileSync } from 'node:child_process';
import { test } from '@playwright/test';
import { BASE, check } from './support.mjs';

test('versions', async () => {
  function client() {
    const jar = new Map();
    const call = async (method, path, body) => {
      const headers = { Origin: BASE, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return { status: res.status, data: await res.json().catch(() => null) };
    };
    return { call };
  }

  async function signIn(c) {
    let r = await c.call('POST', '/auth/sign-in/anonymous', {});
    // Sign-ins are rate-limited to 10 a minute per IP (other e2e scripts sign in too): wait for the window to reset, once
    if (r.status === 429) {
      console.log('  (sign-in rate limit reached, waiting a minute)');
      await new Promise(res => setTimeout(res, 61_000));
      r = await c.call('POST', '/auth/sign-in/anonymous', {});
    }
    check(r.status === 200, 'signed in');
  }

  const owner = client(),
    editor = client();
  await signIn(owner);
  await signIn(editor);
  const id = (await owner.call('POST', '/projects', { name: 'Versions', template: 'blank' })).data.id;
  const token = (await owner.call('POST', `/projects/${id}/links`, { role: 'editor' })).data.token;
  await editor.call('POST', `/share/${token}/accept`);

  let head = 1;
  const content = (await owner.call('GET', `/projects/${id}`)).data.content;
  const save = async (who, summary, extra = {}) => {
    const r = await who.call('PUT', `/projects/${id}`, { base: head, summary, content: { ...content, name: `Versions ${summary}` }, ...extra });
    if (r.status === 200) head = r.data.version;
    return r;
  };
  const versions = async () => (await owner.call('GET', `/projects/${id}/versions`)).data.map(v => [v.version, v.summary]);

  await save(owner, 'a');
  await save(owner, 'b');
  await save(owner, 'c');
  let list = await versions();
  check(head === 4, `version numbers keep counting (head ${head})`);
  check(JSON.stringify(list.map(v => v[0])) === '[4,1]', `quick saves by one author merge, version 1 is kept: ${JSON.stringify(list)}`);
  check(/a.+b.+c/.test(list[0][1]), `the merged version lists every change: ${list[0][1]}`);

  await save(editor, 'd');
  list = await versions();
  check(JSON.stringify(list.map(v => v[0])) === '[5,4,1]', `another author's save is its own version: ${JSON.stringify(list.map(v => v[0]))}`);

  await save(owner, 'e');
  await save(owner, 'restore', { checkpoint: true });
  list = await versions();
  check(JSON.stringify(list.map(v => v[0])) === '[7,6,5,4,1]', `a checkpoint (restore) keeps the version before it: ${JSON.stringify(list.map(v => v[0]))}`);

  // Past the squash window: age the head version in the local database, then save again
  execFileSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'plinth',
      '--local',
      '--command',
      `update project_version set created_at = created_at - 3600000, started_at = started_at - 3600000 where project_id = '${id}' and version = ${head}`,
    ],
    { stdio: 'ignore' },
  );
  await save(owner, 'later');
  list = await versions();
  check(JSON.stringify(list.map(v => v[0])) === '[8,7,6,5,4,1]', `a save after the squash window starts a new version: ${JSON.stringify(list.map(v => v[0]))}`);

  const stale = await owner.call('PUT', `/projects/${id}`, { base: 4, summary: 'stale', content });
  check(stale.status === 409, `a save on an old base still conflicts (${stale.status})`);
  await owner.call('DELETE', `/projects/${id}`);
});
