import type { Severity } from './issues.js';

export type FlagRuleKind = 'builtin' | 'custom_mechanical' | 'custom_ai';

/**
 * Per-project detection configuration. Built-in detectors get one row per
 * detector id (toggle + params). Custom flags carry their definition in
 * `params.rule` (mechanical) or `params.prompt` (AI).
 */
export interface FlagRule {
  id: string;
  projectId: string;
  /** Built-in detector id, or `custom:<slug>` for user-defined flags. */
  detector: string;
  kind: FlagRuleKind;
  enabled: boolean;
  params: Record<string, unknown>;
  createdAt?: string;
}

/**
 * Kind A — mechanical custom flag. Composed only from primitives the engine
 * can evaluate deterministically over the event stream, so it is free by
 * definition. The dashboard's dropdown builder only ever emits this shape.
 */
export interface MechanicalRule {
  name: string;
  severity: Severity;
  when: { all: MechanicalCondition[] };
  /** Window all conditions must fall inside, e.g. "8s" or 8000 (ms). Whole session if absent. */
  within?: string | number;
}

export type MechanicalCondition =
  | { urlIs: string }
  | { urlMatches: string }
  | { clickOn: string }
  | { consoleMatches: string }
  | { networkMatches: { path?: string; statusMin?: number } }
  | { formSubmitted: string };

/** Kind B — AI judgment flag (BYO-key). Only ever evaluated by the AI worker. */
export interface AiRule {
  name: string;
  severity: Severity;
  /** Plain-language judgment, e.g. "does the checkout screen look broken?" */
  prompt: string;
  /** Restrict to sessions that visited this URL/path (keeps model calls rare). */
  urlFilter?: string;
}
