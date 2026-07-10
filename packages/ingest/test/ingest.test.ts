import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { IssueGroup, Project } from '@snag/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { MemoryStore } from '../src/db/memory.js';
import { payload, roughSessionEvents, snag, snapshot } from './helpers.js';

const config = loadConfig({ SESSION_IDLE_MS: '1000' } as unknown as NodeJS.ProcessEnv);

let store: MemoryStore;
let app: FastifyInstance;
let project: Project;

beforeEach(async () => {
  store = new MemoryStore();
  app = buildApp(store, config);
  project = JSON.parse(
    (
      await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Demo' } })
    ).body,
  ) as Project;
});

describe('POST /ingest', () => {
  it('accepts a valid batch and creates the session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-1', roughSessionEvents()),
    });
    expect(res.statusCode).toBe(202);
    const sessions = await store.listSessions(project.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.eventCount).toBe(5);
  });

  it('rejects unknown project keys', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload('pk_live_nope', 'sess-1', []),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed payloads', async () => {
    const res = await app.inject({ method: 'POST', url: '/ingest', payload: { nope: true } });
    expect(res.statusCode).toBe(400);
  });

  it('keeps chunks ordered by seq across batches', async () => {
    const events = roughSessionEvents();
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 's', events.slice(2), { seqFrom: 2 }),
    });
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 's', events.slice(0, 2), { seqFrom: 0 }),
    });
    const stored = await store.getSessionEvents(`${project.id}:s`);
    expect(stored.map((e) => e.timestamp)).toEqual(events.map((e) => e.timestamp));
  });

  it('separates two projects sharing one deployment', async () => {
    const other = JSON.parse(
      (
        await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'Other' } })
      ).body,
    ) as Project;
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'shared-id', roughSessionEvents()),
    });
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(other.projectKey, 'shared-id', roughSessionEvents().slice(0, 2)),
    });
    expect(await store.listSessions(project.id)).toHaveLength(1);
    expect(await store.listSessions(other.id)).toHaveLength(1);
    expect((await store.listSessions(project.id))[0]!.eventCount).toBe(5);
    expect((await store.listSessions(other.id))[0]!.eventCount).toBe(2);
  });
});

describe('detection pipeline end to end', () => {
  it('final flush → worker pass → grouped issues appear → confirm persists', async () => {
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-1', roughSessionEvents(), { final: true }),
    });

    const tick = await app.inject({ method: 'POST', url: '/api/admin/tick' });
    expect(tick.statusCode).toBe(200);
    expect(JSON.parse(tick.body).processed).toBe(1);

    const issuesRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/issues`,
    });
    const groups = JSON.parse(issuesRes.body) as IssueGroup[];
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const detectors = groups.map((g) => g.detector);
    expect(detectors).toContain('network_failure');
    expect(detectors).toContain('console_error');

    // Confirm the network failure group
    const netGroup = groups.find((g) => g.detector === 'network_failure')!;
    const statusRes = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/issues/${encodeURIComponent(netGroup.groupKey)}/status`,
      payload: { status: 'confirmed', note: 'real bug' },
    });
    expect(statusRes.statusCode).toBe(200);

    const after = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${project.id}/issues?status=confirmed`,
        })
      ).body,
    ) as IssueGroup[];
    expect(after).toHaveLength(1);
    expect(after[0]!.groupKey).toBe(netGroup.groupKey);
  });

  it('idle sessions get sealed and processed without a final flush', async () => {
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-idle', roughSessionEvents()),
    });
    // meta.ts is T0 (in the past), so the session is already idle > 1s.
    const tick = await app.inject({ method: 'POST', url: '/api/admin/tick' });
    expect(JSON.parse(tick.body).sealed).toBe(1);
    const sessions = await store.listSessions(project.id);
    expect(sessions[0]!.status).toBe('processed');
  });

  it('disabling a detector via flag rules changes what future sessions flag', async () => {
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/flags/console_error`,
      payload: { enabled: false },
    });
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-2', roughSessionEvents(), { final: true }),
    });
    await app.inject({ method: 'POST', url: '/api/admin/tick' });
    const groups = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/issues` })).body,
    ) as IssueGroup[];
    expect(groups.map((g) => g.detector)).not.toContain('console_error');
    expect(groups.map((g) => g.detector)).toContain('network_failure');
  });

  it('a custom mechanical flag fires like a built-in', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/flags`,
      payload: {
        kind: 'custom_mechanical',
        rule: {
          name: 'Payment API failed at checkout',
          severity: 'high',
          when: {
            all: [{ urlMatches: '/checkout' }, { networkMatches: { path: '/api/pay', statusMin: 400 } }],
          },
          within: '30s',
        },
      },
    });
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-3', roughSessionEvents(), { final: true }),
    });
    await app.inject({ method: 'POST', url: '/api/admin/tick' });
    const groups = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/issues` })).body,
    ) as IssueGroup[];
    const custom = groups.find((g) => g.detector.startsWith('custom:'));
    expect(custom).toBeDefined();
    expect(custom!.title).toBe('Payment API failed at checkout');
    expect(custom!.severity).toBe('high');
  });

  it('healthy sessions produce zero issues', async () => {
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(
        project.projectKey,
        'sess-ok',
        [
          snapshot(0),
          snag(10, { kind: 'navigation', url: 'https://app.test/', trigger: 'initial' }),
          snag(60_000, { kind: 'page_hide' }),
        ],
        { final: true },
      ),
    });
    await app.inject({ method: 'POST', url: '/api/admin/tick' });
    const groups = JSON.parse(
      (await app.inject({ method: 'GET', url: `/api/projects/${project.id}/issues` })).body,
    ) as IssueGroup[];
    expect(groups).toHaveLength(0);
  });
});

describe('replay data', () => {
  it('serves the stored event stream for a session', async () => {
    await app.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 'sess-r', roughSessionEvents(), { final: true }),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/sessions/${encodeURIComponent(`${project.id}:sess-r`)}/events`,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { events: unknown[] };
    expect(body.events).toHaveLength(5);
  });
});

describe('api auth', () => {
  it('requires the bearer token when configured', async () => {
    const secured = buildApp(
      store,
      loadConfig({ SNAG_API_TOKEN: 'secret' } as unknown as NodeJS.ProcessEnv),
    );
    const denied = await secured.inject({ method: 'GET', url: '/api/projects' });
    expect(denied.statusCode).toBe(401);
    const ok = await secured.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: 'Bearer secret' },
    });
    expect(ok.statusCode).toBe(200);
    // /ingest stays key-based, not token-based
    const ingest = await secured.inject({
      method: 'POST',
      url: '/ingest',
      payload: payload(project.projectKey, 's', []),
    });
    expect(ingest.statusCode).toBe(202);
  });
});
