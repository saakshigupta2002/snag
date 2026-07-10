import { normalize } from '@snag/detectors';
import type { IssueGroup } from '@snag/shared';
import type { Config } from '../config.js';
import { groupIssues, type Store } from '../db/store.js';
import { createProvider, type AiProvider } from './provider.js';

/**
 * The cost funnel, enforced in code:
 *   1. Off by default — runs only if the project opted in AND a key exists.
 *   2. Runs only on already-flagged, deduped issue groups (never raw traffic).
 *   3. One analysis per group, ever (dedup = analyze the group once).
 *   4. Daily cap + optional sampling as further ceilings.
 */
export async function runAiPass(store: Store, config: Config): Promise<number> {
  const { provider: providerName, apiKey, model, dailyCap } = config.ai;
  if (!providerName || !apiKey) return 0;

  const projects = await store.listProjects();
  const optedIn = projects.filter((p) => p.settings.ai?.enabled);
  if (!optedIn.length) return 0;

  let remaining = dailyCap - (await store.aiCallsToday());
  if (remaining <= 0) return 0;

  const provider = createProvider(providerName, apiKey, model);
  let calls = 0;

  for (const project of optedIn) {
    if (remaining <= 0) break;
    const sampling = clamp01(project.settings.ai?.sampling ?? 1);
    const issues = await store.listIssues(project.id);
    const groups = groupIssues(issues).filter((g) => g.status === 'open');

    for (const group of groups) {
      if (remaining <= 0) break;
      if (await store.hasAiAnalysis(project.id, group.groupKey)) continue;
      if (Math.random() > sampling) continue;

      try {
        const prompt = await buildPrompt(store, group);
        const { text, tokens } = await provider.complete(prompt);
        if (!text) continue;
        await store.saveAiAnalysis({
          projectId: project.id,
          groupKey: group.groupKey,
          provider: provider.name,
          model: provider.model,
          summary: text.slice(0, 600),
          tokens,
        });
        remaining--;
        calls++;
      } catch (err) {
        console.error(`[snag] ai analysis failed for ${group.groupKey}`, err);
      }
    }
  }
  return calls;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 1;
}

/**
 * Context = the flagged moment plus nearby technical evidence (console,
 * network, navigation) from the sample session — a "clip transcript", not
 * the whole session. Everything in it was already masked/redacted at source.
 */
async function buildPrompt(store: Store, group: IssueGroup): Promise<string> {
  const lines: string[] = [];
  const sample = group.sample;
  if (sample.sessionId) {
    const events = await store.getSessionEvents(sample.sessionId).catch(() => []);
    const windowMs = 15_000;
    const nearby = normalize(events).filter(
      (e) => e.ts >= sample.tsStart - windowMs && e.ts <= sample.tsEnd + windowMs,
    );
    for (const e of nearby.slice(0, 40)) {
      const dt = ((e.ts - sample.tsStart) / 1000).toFixed(1);
      switch (e.t) {
        case 'click':
          lines.push(`${dt}s click ${e.selector}${e.text ? ` ("${e.text}")` : ''}`);
          break;
        case 'console':
          lines.push(`${dt}s console.${e.level}: ${e.message.slice(0, 200)}`);
          break;
        case 'error':
          lines.push(`${dt}s uncaught: ${e.message.slice(0, 200)}`);
          break;
        case 'network':
          lines.push(
            `${dt}s ${e.method} ${e.path} → ${e.status ?? e.error ?? 'timeout'} (${e.durationMs}ms)`,
          );
          break;
        case 'navigation':
          lines.push(`${dt}s navigate ${e.path} (${e.trigger})`);
          break;
        case 'form':
          lines.push(`${dt}s form ${e.action} ${e.formSelector}`);
          break;
        default:
          break;
      }
    }
  }

  return [
    'You are helping a founder triage an automatically flagged moment from a real user session of their web app.',
    `Flag: ${group.title}`,
    `Detector: ${group.detector}; severity ${group.severity}; seen ${group.occurrences} time(s) across ${group.sessionCount} session(s).`,
    `Evidence: ${JSON.stringify(group.sample.meta).slice(0, 500)}`,
    lines.length ? `Timeline around the moment (t=0 is the flag):\n${lines.join('\n')}` : '',
    'In 1–2 plain-English sentences, say what most likely went wrong for the user and what the technical cause looks like. No preamble, no hedging boilerplate.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
