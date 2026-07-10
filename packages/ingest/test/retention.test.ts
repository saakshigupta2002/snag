import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/db/memory.js';
import { roughSessionEvents } from './helpers.js';

describe('retention pruning', () => {
  it('prunes old sessions but keeps confirmed issues', async () => {
    const store = new MemoryStore();
    const project = await store.createProject('P');
    await store.appendChunk({
      projectId: project.id,
      clientSessionId: 'old',
      events: roughSessionEvents(),
      seqFrom: 0,
      seqTo: 4,
      meta: { ts: Date.now() - 40 * 86_400_000, final: true },
    });
    const sid = `${project.id}:old`;
    await store.insertIssues([
      {
        sessionId: sid,
        projectId: project.id,
        detector: 'network_failure',
        severity: 'high',
        tsStart: 0,
        tsEnd: 0,
        status: 'confirmed',
        groupKey: 'network_failure|POST /api/pay 5xx',
        title: 'POST /api/pay failed (500)',
        meta: {},
        occurrences: 1,
      },
      {
        sessionId: sid,
        projectId: project.id,
        detector: 'console_error',
        severity: 'medium',
        tsStart: 0,
        tsEnd: 0,
        status: 'open',
        groupKey: 'console_error|payment failed',
        title: 'Console error: payment failed',
        meta: {},
        occurrences: 1,
      },
    ]);

    const pruned = await store.pruneSessions(30);
    expect(pruned).toBe(1);
    expect(await store.getSession(sid)).toBeUndefined();
    expect(await store.getSessionEvents(sid)).toHaveLength(0);

    const remaining = await store.listIssues(project.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.status).toBe('confirmed');
    expect(remaining[0]!.sessionId).toBeNull(); // survives its raw session data
  });

  it('keeps sessions inside the window', async () => {
    const store = new MemoryStore();
    const project = await store.createProject('P');
    await store.appendChunk({
      projectId: project.id,
      clientSessionId: 'fresh',
      events: [],
      seqFrom: 0,
      seqTo: 0,
      meta: { ts: Date.now() },
    });
    expect(await store.pruneSessions(30)).toBe(0);
    expect(await store.listSessions(project.id)).toHaveLength(1);
  });
});
