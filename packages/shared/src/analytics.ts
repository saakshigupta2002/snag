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
