import { createProject, type Project } from '@plinth/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import type { Role } from '@/shared/roles';
import { createEditorStore } from '.';

vi.mock('@/lib/api', async orig => ({ ...(await orig<typeof import('@/lib/api')>()), api: vi.fn() }));
const mockApi = vi.mocked(api);

const project = (name = 'test') => createProject({ id: 'p1', name, language: 'en' });
const room = { level: 'L1', name: 'A', rect: [0, 0, 4000, 4000] };

function open(role: Role = 'owner', content: Project = project()) {
  const store = createEditorStore({ id: 'p1', name: 'test', role, version: 1, content });
  const disconnect = store.getState().connect();
  return { store, disconnect, s: () => store.getState() };
}

/** PUT /projects/p1 calls made so far */
const saves = () => mockApi.mock.calls.filter(([path, init]) => path === '/projects/p1' && init?.method === 'PUT');

beforeEach(() => {
  vi.useFakeTimers();
  mockApi.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('editor store', () => {
  it('autosaves an edit after a short pause, with the change as the summary', async () => {
    const { s } = open();
    mockApi.mockResolvedValue({ version: 2 });
    expect((await s().call('room_add', room)).ok).toBe(true);
    expect(s().dirty).toBe(true);
    expect(saves()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1600);
    expect(saves()).toHaveLength(1);
    const body = (saves()[0][1] as { json: { base: number; summary: string } }).json;
    expect(body.base).toBe(1);
    expect(body.summary).toContain('A');
    expect(body).not.toHaveProperty('checkpoint');
    expect(s()).toMatchObject({ dirty: false, version: 2, pendingLabels: [] });
  });

  it('does not treat loading a version as an edit', async () => {
    const { s } = open();
    mockApi.mockResolvedValue({ version: 1, content: project('old') });
    await s().loadVersion(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s().readOnlyVersion).toBe(1);
    expect(s().project.name).toBe('old');
    expect(s().dirty).toBe(false);
    expect(saves()).toHaveLength(0);
  });

  it('refuses edits while viewing a historical version or as a viewer', async () => {
    const viewer = open('viewer');
    expect((await viewer.s().call('room_add', room)).error?.code).toBe('forbidden');

    const { s } = open();
    mockApi.mockResolvedValue({ version: 1, content: project() });
    await s().loadVersion(1);
    expect((await s().call('room_add', room)).error?.code).toBe('forbidden');
    expect(s().project.spaces).toHaveLength(0);
  });

  it('reports a save conflict, and "keep mine" saves again on top of the other version', async () => {
    const { s } = open();
    const theirs = project('theirs');
    mockApi.mockRejectedValueOnce(new ApiError(409, 'conflict', { conflict: true, version: 5, content: theirs }));
    await s().call('room_add', room);
    await vi.advanceTimersByTimeAsync(1600);
    expect(s().conflict).toMatchObject({ version: 5 });

    mockApi.mockResolvedValue({ version: 6 });
    await s().resolveConflict('mine');
    expect((saves().at(-1)![1] as { json: { base: number } }).json.base).toBe(5);
    expect(s()).toMatchObject({ conflict: null, version: 6, dirty: false });
    expect(s().project.spaces).toHaveLength(1);
  });

  it('"keep theirs" loads the other version without saving', async () => {
    const { s } = open();
    mockApi.mockRejectedValueOnce(new ApiError(409, 'conflict', { conflict: true, version: 5, content: project('theirs') }));
    await s().call('room_add', room);
    await vi.advanceTimersByTimeAsync(1600);
    await s().resolveConflict('theirs');
    await vi.advanceTimersByTimeAsync(5000);
    expect(s()).toMatchObject({ conflict: null, version: 5, dirty: false });
    expect(s().project.name).toBe('theirs');
    expect(saves()).toHaveLength(1);
  });

  it('restores an old version as a new save', async () => {
    const { s } = open();
    const old = project('v1');
    mockApi.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/projects/p1/versions/1') return { version: 1, content: old };
      if (path === '/projects/p1' && !init?.method) return { id: 'p1', version: 3, content: project('latest') };
      return { version: 4 };
    });
    await s().restoreVersion(1);
    const body = (saves().at(-1)![1] as { json: { base: number; content: Project; summary: string; checkpoint?: boolean } }).json;
    expect(body.base).toBe(3);
    // A restore must not be merged into the autosave before it
    expect(body.checkpoint).toBe(true);
    expect(body.content.name).toBe('v1');
    expect(s()).toMatchObject({ version: 4, dirty: false, readOnlyVersion: null });
  });

  it('stops autosaving after disconnect', async () => {
    const { s, disconnect } = open();
    mockApi.mockResolvedValue({ version: 2 });
    await s().call('room_add', room);
    disconnect();
    await vi.advanceTimersByTimeAsync(5000);
    expect(saves()).toHaveLength(0);
  });

  it('hands a message to the agent', () => {
    const { s } = open();
    s().askAgent('hello');
    expect(s().ask?.text).toBe('hello');
  });
});
