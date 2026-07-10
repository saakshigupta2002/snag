import type { IssueCandidate, Severity } from '@snag/shared';
import type { NormalizedEvent } from './normalize.js';

/**
 * A detector is a small, independent, pure module: input = the ordered event
 * stream + its params; output = zero or more issue candidates. Detectors are
 * registered in a list so new ones plug in without touching the core.
 */
export interface Detector {
  id: string;
  tier: 1 | 2;
  /** Off-by-default until a detector clears the precision bar (Principle 2). */
  defaultEnabled: boolean;
  defaultSeverity: Severity;
  defaultParams: Record<string, unknown>;
  /** Plain-English one-liner shown in flag settings. */
  describe: string;
  run(events: NormalizedEvent[], params: Record<string, unknown>): IssueCandidate[];
}

export function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function strings(params: Record<string, unknown>, key: string): string[] {
  const v = params[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function bool(params: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}
