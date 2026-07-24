import type { IssueStatus, Severity } from './issues.js';

/** A day bucket for time-series charts. `day` is an ISO date (YYYY-MM-DD). */
export interface TrendPoint {
  day: string;
  count: number;
}

export interface CountRow {
  key: string;
  count: number;
}

/** Everything the overview/home screen needs, in one payload. */
export interface Overview {
  totals: {
    openIssues: number;
    confirmedIssues: number;
    sessions: number;
    issueGroups: number;
  };
  bySeverity: Record<Severity, number>;
  /** New (created) issue groups per day, last N days. */
  issuesOverTime: TrendPoint[];
  topDetectors: CountRow[];
  topPages: CountRow[];
  ingest: IngestHealth;
}

/** A behaviour-insight stat: how often a detector fired, as % of sessions. */
export interface InsightStat {
  detector: string;
  label: string;
  sessions: number;
  pct: number;
}

/** Core Web Vitals rollup for the performance card. */
export interface VitalStat {
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
  /** 0–100 Clarity-style score, or null when no samples. */
  score: number | null;
  /** % of pageviews in each Web-Vitals bucket. */
  good: number;
  needs: number;
  poor: number;
  sampleSize: number;
}

/** Rich, session-centric analytics for the Clarity-style overview. */
export interface Analytics {
  days: number;
  kpis: {
    sessions: number;
    avgPagesPerSession: number;
    avgDurationMs: number;
    avgScrollPct: number | null;
    eventsTotal: number;
  };
  insights: InsightStat[];
  device: CountRow[];
  browser: CountRow[];
  os: CountRow[];
  topPages: CountRow[];
  entryPages: CountRow[];
  exitPages: CountRow[];
  referrers: CountRow[];
  jsErrors: { total: number; sessionsWith: number; pct: number };
  bots: { sessions: number; pct: number };
  performance: VitalStat;
  sessionsOverTime: TrendPoint[];
  issuesOverTime: TrendPoint[];
  topDetectors: CountRow[];
  ingest: IngestHealth;
}

export interface IngestHealth {
  lastSessionAt: string | null;
  sessionsToday: number;
  eventsTotal: number;
  /** Minutes since the last session arrived, or null if none. */
  minutesSinceLast: number | null;
}

export interface IssueNote {
  id: string;
  action: 'confirmed' | 'dismissed' | 'reopened' | 'note';
  note: string | null;
  createdAt: string;
}

export interface DetectorStat {
  detector: string;
  fired: number;
  confirmed: number;
  dismissed: number;
}

export interface AlertSettings {
  webhookUrl?: string;
  /** Only fire for issues at or above this severity. Default 'high'. */
  minSeverity?: Severity;
}

/** Issue-list filters supported by the API. */
export interface IssueQuery {
  status?: IssueStatus | 'all';
  severity?: Severity | 'all';
  detector?: string;
  page?: string;
  q?: string;
  since?: string;
}
