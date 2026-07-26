export type Severity = 'low' | 'medium' | 'high';

export type IssueStatus = 'open' | 'confirmed' | 'dismissed';

/**
 * Who found this issue. `detector` is the built-in rule-based engine (the
 * default, zero-cost path); `agent` is a Claude Code agent that judged it a real
 * bug (e.g. during an explore sweep) and filed it via the CLI.
 */
export type IssueSource = 'detector' | 'agent';

/** What a detector emits: zero or more candidates per session. */
export interface IssueCandidate {
  detector: string;
  severity: Severity;
  /** Epoch ms where the flagged moment starts (replay seeks a few s before). */
  tsStart: number;
  tsEnd: number;
  /** detector + normalized selector/URL/message — dedups repeats of one bug. */
  groupKey: string;
  /** One-line plain-English description shown in the issue list. */
  title: string;
  /** Detector-specific evidence (selector, url, status, message, counts…). */
  meta: Record<string, unknown>;
  /** Times this same candidate fired within the session (post-dedup). */
  occurrences: number;
}

/** A stored issue row (one per candidate; the dashboard groups by groupKey). */
export interface Issue extends IssueCandidate {
  id: string;
  sessionId: string | null;
  projectId: string;
  status: IssueStatus;
  /** Provenance. Absent on older rows, treat as 'detector'. */
  source?: IssueSource;
  note?: string;
  createdAt: string;
}

/** Grouped view returned by the API: one row per underlying problem. */
export interface IssueGroup {
  groupKey: string;
  detector: string;
  severity: Severity;
  title: string;
  status: IssueStatus;
  /** Where the group came from: the rule engine or an AI agent. */
  source: IssueSource;
  occurrences: number;
  sessionCount: number;
  firstSeen: string;
  lastSeen: string;
  /** A representative issue to open in the replay view. */
  sample: Issue;
  aiSummary?: string;
}
