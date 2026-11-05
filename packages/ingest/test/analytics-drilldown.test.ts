import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Analytics, IngestPayload, Project, RawEvent, Session, SnagPayload } from '@snag/shared';
import { RRWEB_TYPE, SNAG_CUSTOM_TAG } from '@snag/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryStore } from '../src/db/memory.js';

const config = loadConfig({ SESSION_IDLE_MS: '1000' } as unknown as NodeJS.ProcessEnv);
const T0 = Date.now() - 5000;

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; rv:120.0) Gecko/20100101 Firefox/120.0';
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function snag(off: number, payload: SnagPayload): RawEvent {
  return { type: RRWEB_TYPE.Custom, data: { tag: SNAG_CUSTOM_TAG, payload }, timestamp: T0 + off };
}
function snapshot(off: number): RawEvent {
  return { type: RRWEB_TYPE.FullSnapshot, data: {}, timestamp: T0 + off };
}
function build(projectKey: string, sessionId: string, ua: string, events: RawEvent[]): IngestPayload {
  return {
    projectKey,
    sessionId,
    events,
    seqFrom: 0,
    seqTo: Math.max(events.length - 1, 0),
    meta: { url: 'https://app.test/', ts: Date.now() - 60_000, userAgent: ua, final: true },
  };
}

describe('interactive analytics: scroll depth + session drill-down filters', () => {
  let store: MemoryStore;
  let app: FastifyInstance;
  let project: Project;

  beforeEach(async () => {
    store = new MemoryStore();
    app = buildApp(store, config);
    project = JSON.parse(
      (await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Demo' } })).body,
    ) as Project;

    const sessions: [string, string, RawEvent[]][] = [
      // A: deep scroll (90%), human Chrome
      ['A-deep', CHROME, [snapshot(0), snag(10, { kind: 'navigation', url: 'https://app.test/', trigger: 'initial' }), snag(500, { kind: 'vitals', scrollPct: 90 }), snag(900, { kind: 'page_hide' })]],
      // B: shallow scroll (30%) + a JS error, human Firefox
      ['B-shallow-err', FIREFOX, [snapshot(0), snag(10, { kind: 'navigation', url: 'https://app.test/', trigger: 'initial' }), snag(200, { kind: 'console', level: 'error', message: 'boom' }), snag(500, { kind: 'vitals', scrollPct: 30 }), snag(900, { kind: 'page_hide' })]],
      // C: bot (excluded from human analytics)
      ['C-bot', BOT, [snapshot(0), snag(10, { kind: 'navigation', url: 'https://app.test/', trigger: 'initial' }), snag(500, { kind: 'vitals', scrollPct: 80 }), snag(900, { kind: 'page_hide' })]],
    ];
    for (const [sid, ua, events] of sessions) {
      await app.inject({ method: 'POST', url: '/ingest', payload: build(project.projectKey, sid, ua, events) });
    }
    await app.inject({ method: 'POST', url: '/api/admin/tick' });
  });

  const analytics = async (q = ''): Promise<Analytics> =>
    JSON.parse((await app.inject({ method: 'GET', url: `/api/projects/${project.id}/analytics${q}` })).body);
  const sessions = async (q = ''): Promise<Session[]> =>
    JSON.parse((await app.inject({ method: 'GET', url: `/api/projects/${project.id}/sessions${q}` })).body);

  it('computes a cumulative scroll-depth distribution over humans only', async () => {
    const a = await analytics('?days=14');
    expect(a.scrollDepth.sampleSize).toBe(2); // bot excluded
    const byPct = Object.fromEntries(a.scrollDepth.buckets.map((b) => [b.pct, b]));
    expect(byPct[25]!.sessions).toBe(2); // 90 + 30
    expect(byPct[50]!.sessions).toBe(1); // 90
    expect(byPct[75]!.sessions).toBe(1); // 90
    expect(byPct[100]!.sessions).toBe(0);
    expect(byPct[25]!.sharePct).toBe(100);
    expect(byPct[50]!.sharePct).toBe(50);
  });

  it('reports js errors and bots (the drill-able cards)', async () => {
    const a = await analytics('?days=14');
    expect(a.jsErrors.sessionsWith).toBe(1);
    expect(a.bots.sessions).toBe(1);
    expect(a.browser.find((r) => r.key === 'Chrome')?.count).toBe(1);
    expect(a.browser.find((r) => r.key === 'Firefox')?.count).toBe(1);
  });

  it('filters the sessions list by browser / errors / bot for drill-down', async () => {
    // Stored ids are `<projectId>:<clientId>`: assert on the client suffix.
    const clientId = (s: Session) => s.id.split(':').slice(1).join(':');
    expect((await sessions()).length).toBe(3);
    expect((await sessions('?browser=Chrome')).map(clientId)).toEqual(['A-deep']);
    expect((await sessions('?errors=1')).map(clientId)).toEqual(['B-shallow-err']);
    expect((await sessions('?bot=1')).map(clientId)).toEqual(['C-bot']);
    expect((await sessions('?bot=0')).map(clientId).sort()).toEqual(['A-deep', 'B-shallow-err']);
  });

  it('filters the sessions list by date range', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect((await sessions(`?from=${today}`)).length).toBe(3);
    expect((await sessions(`?from=${tomorrow}`)).length).toBe(0);
  });
});
