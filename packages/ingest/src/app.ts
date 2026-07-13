import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { IngestPayload, IssueStatus, ProjectSettings, Severity } from '@snag/shared';
import { registry } from '@snag/detectors';
import type { Config } from './config.js';
import {
  computeDetectorStats,
  computeOverview,
  computeTrend,
  groupIssues,
  sessionDbId,
  type Store,
} from './db/store.js';
import { processSession, runWorkerPass } from './worker.js';
import { SDK_BUNDLE_BASE64 } from './sdk-bundle.js';

// Decoded once at module load; served to browsers as a drop-in <script>.
const SDK_JS = Buffer.from(SDK_BUNDLE_BASE64, 'base64').toString('utf8');

const MAX_EVENTS_PER_BATCH = 5000;
const RATE_LIMIT_PER_MIN = 240;

/** Naive per-key sliding-window rate limiter — enough for v1 self-hosting. */
class RateLimiter {
  private hits = new Map<string, number[]>();
  allow(key: string, now = Date.now()): boolean {
    const windowStart = now - 60_000;
    const list = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (list.length >= RATE_LIMIT_PER_MIN) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'flag'
  );
}

export function buildApp(store: Store, config: Config): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 8 * 1024 * 1024 });
  void app.register(cors, { origin: true });
  const limiter = new RateLimiter();

  // Management API auth — /ingest stays open (the public project key
  // identifies, it does not authenticate; rate limiting bounds abuse).
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.url.startsWith('/api/')) return;
    if (req.url === '/api/health') return;
    // Public read-only demo resolve: the unguessable publicId in the path IS the
    // capability. It returns only {id, name, publicId} for an explicitly shared
    // project — never traffic, and never anything for a project that isn't shared.
    if (req.url.startsWith('/api/public-projects/')) return;
    if (!config.apiToken) return;
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${config.apiToken}`) {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/api/health', async () => ({ ok: true }));

  // ── Browser SDK, self-hosted ──────────────────────────────────────────────
  // Lets any site install Snag with a <script> tag pointing at this service,
  // no npm publish required. Public (not under /api/), so no token needed.
  const serveSdk = async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!SDK_JS) return reply.code(404).send({ error: 'sdk bundle not embedded' });
    return reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'public, max-age=3600')
      .send(SDK_JS);
  };
  app.get('/snag.js', serveSdk);
  app.get('/snag.iife.js', serveSdk);

  // ── Ingestion ─────────────────────────────────────────────────────────────
  app.post('/ingest', async (req, reply) => {
    const body = req.body as Partial<IngestPayload> | null;
    if (
      !body ||
      typeof body.projectKey !== 'string' ||
      typeof body.sessionId !== 'string' ||
      body.sessionId.length > 128 ||
      !Array.isArray(body.events) ||
      typeof body.seqFrom !== 'number' ||
      typeof body.seqTo !== 'number' ||
      typeof body.meta !== 'object' ||
      body.meta === null
    ) {
      return reply.code(400).send({ error: 'invalid payload' });
    }
    if (!limiter.allow(body.projectKey)) return reply.code(429).send({ error: 'rate limited' });
    const project = await store.getProjectByKey(body.projectKey);
    if (!project) return reply.code(401).send({ error: 'unknown project key' });
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return reply.code(413).send({ error: 'batch too large' });
    }

    await store.appendChunk({
      projectId: project.id,
      clientSessionId: body.sessionId,
      events: body.events,
      seqFrom: body.seqFrom,
      seqTo: body.seqTo,
      meta: body.meta,
    });

    // Serverless path: no interval worker exists, so the final flush is the
    // moment to run detection for this session.
    if (body.meta.final && config.processOnFinal) {
      const session = await store.getSession(sessionDbId(project.id, body.sessionId));
      if (session?.status === 'completed') await processSession(store, session);
    }
    return reply.code(202).send({ ok: true });
  });

  // ── Projects ──────────────────────────────────────────────────────────────
  app.post('/api/projects', async (req, reply) => {
    const { name } = (req.body ?? {}) as { name?: string };
    if (!name || typeof name !== 'string') return reply.code(400).send({ error: 'name required' });
    return store.createProject(name.slice(0, 100));
  });

  app.get('/api/projects', async () => store.listProjects());

  // Resolve a public demo project by its share slug. Returns only safe fields
  // (never the project key). 404 unless sharing is enabled.
  app.get('/api/public-projects/:publicId', async (req, reply) => {
    const { publicId } = req.params as { publicId: string };
    const project = await store.getProjectByPublicId(publicId);
    if (!project) return reply.code(404).send({ error: 'not found' });
    return { id: project.id, name: project.name, publicId };
  });

  app.get('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await store.getProject(id);
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });

  app.patch('/api/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { name?: string; settings?: ProjectSettings };
    const project = await store.updateProject(id, body);
    if (!project) return reply.code(404).send({ error: 'not found' });
    return project;
  });

  // ── Sessions ──────────────────────────────────────────────────────────────
  app.get('/api/projects/:id/sessions', async (req) => {
    const { id } = req.params as { id: string };
    const { limit } = req.query as { limit?: string };
    return store.listSessions(id, Math.min(Number(limit) || 100, 500));
  });

  app.get('/api/sessions/:sid/events', async (req, reply) => {
    const { sid } = req.params as { sid: string };
    const session = await store.getSession(sid);
    if (!session) return reply.code(404).send({ error: 'not found' });
    const events = await store.getSessionEvents(sid);
    return { session, events };
  });

  // ── Overview / analytics ──────────────────────────────────────────────────
  app.get('/api/projects/:id/overview', async (req) => {
    const { id } = req.params as { id: string };
    const [issues, sessions] = await Promise.all([
      store.listIssues(id),
      store.listSessions(id, 2000),
    ]);
    return computeOverview(issues, sessions);
  });

  app.get('/api/projects/:id/detector-stats', async (req) => {
    const { id } = req.params as { id: string };
    return computeDetectorStats(await store.listIssues(id));
  });

  // ── Issues ────────────────────────────────────────────────────────────────
  app.get('/api/projects/:id/issues', async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as { status?: string; severity?: string; detector?: string };
    const [issues, summaries] = await Promise.all([
      store.listIssues(id),
      store.getAiSummaries(id),
    ]);
    let groups = groupIssues(issues, summaries);
    if (q.status) groups = groups.filter((g) => g.status === (q.status as IssueStatus));
    if (q.severity) groups = groups.filter((g) => g.severity === (q.severity as Severity));
    if (q.detector) groups = groups.filter((g) => g.detector === q.detector);
    return groups;
  });

  app.get('/api/projects/:id/issues/:groupKey', async (req, reply) => {
    const { id, groupKey } = req.params as { id: string; groupKey: string };
    const key = decodeURIComponent(groupKey);
    const [issues, allIssues, notes] = await Promise.all([
      store.issuesByGroup(id, key),
      store.listIssues(id),
      store.getIssueNotes(id, key),
    ]);
    if (!issues.length) return reply.code(404).send({ error: 'not found' });
    const summaries = await store.getAiSummaries(id);
    const [group] = groupIssues(issues, summaries);
    const trend = computeTrend(allIssues, key);
    return { group, issues, notes, trend };
  });

  app.post('/api/projects/:id/issues/:groupKey/status', async (req, reply) => {
    const { id, groupKey } = req.params as { id: string; groupKey: string };
    const { status, note } = (req.body ?? {}) as { status?: IssueStatus; note?: string };
    if (status !== 'open' && status !== 'confirmed' && status !== 'dismissed') {
      return reply.code(400).send({ error: 'status must be open | confirmed | dismissed' });
    }
    const key = decodeURIComponent(groupKey);
    const updated = await store.setGroupStatus(id, key, status, note);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    const action = status === 'open' ? 'reopened' : status;
    await store.addIssueNote(id, key, action, note ?? null);
    return { ok: true, updated };
  });

  // ── Detectors & flag rules ────────────────────────────────────────────────
  app.get('/api/detectors', async () =>
    registry.map((d) => ({
      id: d.id,
      tier: d.tier,
      defaultEnabled: d.defaultEnabled,
      defaultSeverity: d.defaultSeverity,
      defaultParams: d.defaultParams,
      describe: d.describe,
    })),
  );

  app.get('/api/projects/:id/flags', async (req) => {
    const { id } = req.params as { id: string };
    const rules = await store.listFlagRules(id);
    const builtins = registry.map((d) => {
      const rule = rules.find((r) => r.kind === 'builtin' && r.detector === d.id);
      return {
        detector: d.id,
        tier: d.tier,
        describe: d.describe,
        defaultParams: d.defaultParams,
        enabled: rule ? rule.enabled : d.defaultEnabled,
        params: { ...d.defaultParams, ...(rule?.params ?? {}) },
        overridden: !!rule,
      };
    });
    const custom = rules.filter((r) => r.kind !== 'builtin');
    return { builtins, custom };
  });

  app.put('/api/projects/:id/flags/:detector', async (req, reply) => {
    const { id, detector } = req.params as { id: string; detector: string };
    if (!registry.some((d) => d.id === detector)) {
      return reply.code(404).send({ error: 'unknown detector' });
    }
    const body = (req.body ?? {}) as { enabled?: boolean; params?: Record<string, unknown> };
    const detectorDef = registry.find((d) => d.id === detector)!;
    return store.upsertFlagRule({
      projectId: id,
      detector,
      kind: 'builtin',
      enabled: body.enabled ?? detectorDef.defaultEnabled,
      params: body.params ?? {},
    });
  });

  app.post('/api/projects/:id/flags', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      kind?: string;
      rule?: { name?: string };
      aiRule?: { name?: string };
    };
    if (body.kind === 'custom_mechanical') {
      const rule = body.rule;
      if (!rule?.name) return reply.code(400).send({ error: 'rule.name required' });
      return store.upsertFlagRule({
        projectId: id,
        detector: `custom:${slugify(rule.name)}`,
        kind: 'custom_mechanical',
        enabled: true,
        params: { rule },
      });
    }
    if (body.kind === 'custom_ai') {
      const rule = body.aiRule;
      if (!rule?.name) return reply.code(400).send({ error: 'aiRule.name required' });
      return store.upsertFlagRule({
        projectId: id,
        detector: `custom-ai:${slugify(rule.name)}`,
        kind: 'custom_ai',
        enabled: true,
        params: { rule },
      });
    }
    return reply.code(400).send({ error: 'kind must be custom_mechanical | custom_ai' });
  });

  app.delete('/api/projects/:id/flags/rule/:ruleId', async (req, reply) => {
    const { id, ruleId } = req.params as { id: string; ruleId: string };
    const deleted = await store.deleteFlagRule(id, ruleId);
    if (!deleted) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  // ── Ops: force a worker pass (demos, tests, admin, serverless cron) ──────
  // GET is allowed so schedulers like Vercel Cron (which only GET) can call
  // it; the bearer-token hook above still applies.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/admin/tick',
    handler: async () => runWorkerPass(store, config),
  });

  return app;
}
