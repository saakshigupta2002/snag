import type { IssueCandidate, MechanicalRule, RawEvent } from '@snag/shared';
import { normalize } from './normalize.js';
import { registry } from './registry.js';
import { runMechanicalRule } from './mechanical.js';

/** Subset of a FlagRule the engine needs (storage concerns stay outside). */
export interface EngineRule {
  detector: string;
  kind: 'builtin' | 'custom_mechanical' | 'custom_ai';
  enabled: boolean;
  params: Record<string, unknown>;
}

/**
 * Run every enabled detector plus enabled mechanical custom flags over one
 * completed session, then dedupe within the session: the same groupKey firing
 * N times becomes one candidate with occurrences = N, anchored at its first
 * occurrence (that's the moment the replay clip opens on).
 */
export function runEngine(rawEvents: RawEvent[], rules: EngineRule[] = []): IssueCandidate[] {
  const events = normalize(rawEvents);
  const candidates: IssueCandidate[] = [];

  for (const detector of registry) {
    const rule = rules.find((r) => r.kind === 'builtin' && r.detector === detector.id);
    const enabled = rule ? rule.enabled : detector.defaultEnabled;
    if (!enabled) continue;
    const params = { ...detector.defaultParams, ...(rule?.params ?? {}) };
    try {
      candidates.push(...detector.run(events, params));
    } catch {
      // One misbehaving detector must never take down the whole pass.
    }
  }

  for (const rule of rules) {
    if (rule.kind !== 'custom_mechanical' || !rule.enabled) continue;
    const mech = rule.params['rule'] as MechanicalRule | undefined;
    if (!mech || typeof mech !== 'object') continue;
    try {
      candidates.push(...runMechanicalRule(events, mech, rule.detector));
    } catch {
      // Same guarantee for user-defined rules.
    }
  }

  return dedupe(candidates);
}

function dedupe(candidates: IssueCandidate[]): IssueCandidate[] {
  const byKey = new Map<string, IssueCandidate>();
  for (const c of candidates) {
    const existing = byKey.get(c.groupKey);
    if (!existing) {
      byKey.set(c.groupKey, { ...c });
      continue;
    }
    existing.occurrences += c.occurrences;
    // Keep the first occurrence as the anchor; remember the span.
    if (c.tsStart < existing.tsStart) {
      existing.tsStart = c.tsStart;
      existing.tsEnd = c.tsEnd;
      existing.title = c.title;
      existing.meta = c.meta;
    }
    // Escalate to the highest severity seen in the group.
    const rank = { low: 0, medium: 1, high: 2 } as const;
    if (rank[c.severity] > rank[existing.severity]) existing.severity = c.severity;
  }
  return [...byKey.values()].sort((a, b) => a.tsStart - b.tsStart);
}
