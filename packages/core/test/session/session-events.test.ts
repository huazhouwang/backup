import { describe, expect, it } from 'vitest';
import { createProject, createRegistry, Session, type ChangeReason } from '../../src/index.js';

describe('session change notifications', () => {
  it('say why the project changed', async () => {
    const session = new Session(createProject({ id: 't', name: 'test', language: 'en' }));
    const reasons: ChangeReason[] = [];
    session.subscribe((_, reason) => reasons.push(reason));
    await createRegistry().call('room_add', { level: 'L1', name: 'A', rect: [0, 0, 3000, 3000] }, { session, actor: { kind: 'user' } });
    session.undo();
    session.redo();
    session.load(createProject({ id: 't', name: 'test', language: 'en' }));
    expect(reasons).toEqual(['tx', 'undo', 'redo', 'load']);
  });
});
