import { runEngine, type EngineRule } from '@snag/detectors';
import { isSnagEvent, type RawEvent, type Session } from '@snag/shared';
import type { Config } from './config.js';
import {
  browserFromUA,
  isBotUA,
  osFromUA,
  type NewIssue,
  type SessionAggregates,
  type Store,
} from './db/store.js';
import { runAiPass } from './ai/runner.js';
import { fireAlerts } from './alerts.js';

function pathOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, 'http://x.local').pathname || '/';
  } catch {
    return url;
  }
}

/** One-pass rollup over a session's events, computed when it's processed. */
export function computeSessionAggregates(session: Session, events: RawEvent[]): SessionAggregates {
  let pageviews = 0;
  let jsErrors = 0;
  let lcpMs: number | null = null;
  let inpMs: number | null = null;
  let cls: number | null = null;
  let entryPage = pathOf(session.urlFirst);
  let exitPage = entryPage;
  // Compact per-session data for heatmaps/funnels, so those endpoints never
  // re-scan raw events. Bounded so the JSON stays small.
  const MAX_CLICKS = 300;
  const MAX_PATHS = 60;
  const clickPoints: { page: string; x: number; y: number }[] = [];
  const paths: string[] = [];
  let cur = entryPage ?? '/';
  const pushPath = (p: string | null) => {
    if (p && p !== paths[paths.length - 1] && paths.length < MAX_PATHS) paths.push(p);
  };
  pushPath(cur);
  for (const e of events) {
    if (!isSnagEvent(e)) continue;
    const p = e.data.payload;
    if (p.kind === 'navigation') {
      pageviews++;
      const path = pathOf(p.url);
      if (path) {
        exitPage = path;
        cur = path;
        pushPath(path);
        if (!entryPage) entryPage = path;
      }
    } else if (p.kind === 'click' && typeof p.x === 'number' && typeof p.y === 'number') {
      if (clickPoints.length < MAX_CLICKS) clickPoints.push({ page: cur, x: p.x, y: p.y });
    } else if (p.kind === 'error' || (p.kind === 'console' && p.level === 'error')) {
      jsErrors++;
    } else if (p.kind === 'vitals') {
      if (p.lcpMs != null) lcpMs = p.lcpMs;
      if (p.inpMs != null) inpMs = p.inpMs;
      if (p.cls != null) cls = p.cls;
    }
  }
  // Duration comes from the event timestamps (real elapsed time) — the session
  // row's started/ended can collapse when events flush in a single chunk.
  const firstTs = events.length ? events[0]!.timestamp : null;
  const lastTs = events.length ? events[events.length - 1]!.timestamp : null;
  const durFromEvents = firstTs != null && lastTs != null ? lastTs - firstTs : null;
  const durFromRow =
    session.endedAt && session.startedAt
      ? Date.parse(session.endedAt) - Date.parse(session.startedAt)
      : null;
  const dur = durFromEvents != null && durFromEvents > 0 ? durFromEvents : durFromRow;
  return {
    pageviews: Math.max(pageviews, 1),
    entryPage,
    exitPage,
    jsErrors,
    maxScrollPct: null, // deferred — rrweb scroll depth is only approximate
    durationMs: dur != null && dur >= 0 ? dur : null,
    browser: browserFromUA(session.userAgent),
    os: osFromUA(session.userAgent),
    isBot: isBotUA(session.userAgent),
    lcpMs,
    inpMs,
    cls,
    clickPoints,
    paths,
  };
}

export interface WorkerPassResult {
  sealed: number;
  processed: number;
  issues: number;
  pruned: number;
  aiCalls: number;
}

/**
 * Run the engine over one completed session and persist its issues. Shared
 * by the interval worker and the serverless inline path (process-on-final).
 * Returns the number of issues written.
 */
export async function processSession(store: Store, session: Session): Promise<number> {
  try {
    const [events, rules, existing, project] = await Promise.all([
      store.getSessionEvents(session.id),
      store.listFlagRules(session.projectId),
      store.existingGroupKeys(session.projectId),
      store.getProject(session.projectId),
    ]);
    // Persist the analytics rollup for every session, issues or not.
    await store.setSessionAggregates(session.id, computeSessionAggregates(session, events));

    const engineRules: EngineRule[] = rules
      .filter((r) => r.kind === 'builtin' || r.kind === 'custom_mechanical')
      .map((r) => ({ detector: r.detector, kind: r.kind, enabled: r.enabled, params: r.params }));
    const candidates = runEngine(events, engineRules);
    if (!candidates.length) return 0;
    const issues: NewIssue[] = candidates.map((c) => ({
      ...c,
      sessionId: session.id,
      projectId: session.projectId,
      status: 'open',
    }));
    await store.insertIssues(issues);

    // Alert only on genuinely-new issue groups (first time this bug is seen).
    const newGroups = candidates.filter((c) => !existing.has(c.groupKey));
    if (newGroups.length && project) {
      await fireAlerts(project, session, newGroups).catch(() => undefined);
    }
    return issues.length;
  } catch (err) {
    // A bad session must not wedge the queue; log and move on.
    console.error(`[snag] detection failed for session ${session.id}`, err);
    return 0;
  } finally {
    await store.markSessionProcessed(session.id);
  }
}

/**
 * One detection pass: seal idle sessions, run the engine over each completed
 * session, write issues, mark the session processed, then (optionally) let
 * the AI layer glance at the already-flagged slice.
 */
export async function runWorkerPass(store: Store, config: Config): Promise<WorkerPassResult> {
  const sealed = await store.sealIdleSessions(config.sessionIdleMs);
  const sessions = await store.takeCompletedSessions(20);
  let issueCount = 0;
  for (const session of sessions) {
    issueCount += await processSession(store, session);
  }

  const pruned = await maybePrune(store, config);
  const aiCalls = await runAiPass(store, config).catch((err) => {
    console.error('[snag] ai pass failed', err);
    return 0;
  });

  return { sealed, processed: sessions.length, issues: issueCount, pruned, aiCalls };
}

// Retention pruning is cheap but doesn't need to run every tick.
let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 60 * 60_000;

async function maybePrune(store: Store, config: Config): Promise<number> {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return 0;
  lastPruneAt = now;
  return store.pruneSessions(config.retentionDays, now);
}

export function startWorker(store: Store, config: Config): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // never overlap passes
    running = true;
    try {
      await runWorkerPass(store, config);
    } catch (err) {
      console.error('[snag] worker pass failed', err);
    } finally {
      running = false;
    }
  }, config.workerIntervalMs);
  return () => clearInterval(timer);
}
