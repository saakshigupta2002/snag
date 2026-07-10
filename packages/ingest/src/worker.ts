import { runEngine, type EngineRule } from '@snag/detectors';
import type { Session } from '@snag/shared';
import type { Config } from './config.js';
import type { NewIssue, Store } from './db/store.js';
import { runAiPass } from './ai/runner.js';

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
    const [events, rules] = await Promise.all([
      store.getSessionEvents(session.id),
      store.listFlagRules(session.projectId),
    ]);
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
