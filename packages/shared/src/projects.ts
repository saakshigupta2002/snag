export interface ProjectSettings {
  /** Session retention window in days; pruning job enforces it. */
  retentionDays?: number;
  ai?: {
    enabled: boolean;
    /** Analyze at most this fraction of flagged groups when volume is high. */
    sampling?: number;
  };
  /** Fire a webhook when a new qualifying issue appears. */
  alerts?: {
    webhookUrl?: string;
    minSeverity?: 'low' | 'medium' | 'high';
  };
  /** Public read-only demo share for this project. */
  share?: {
    enabled: boolean;
    /** Hard-to-guess slug used in the public /demo/<publicId> URL. */
    publicId?: string;
  };
  /** Masking notes surfaced in the dashboard; enforcement lives in the SDK config. */
  masking?: {
    maskAllInputs?: boolean;
    block?: string[];
    unmask?: string[];
  };
}

export interface Project {
  id: string;
  name: string;
  /** Public site key the SDK sends (pk_live_…). Identifies, does not authenticate. */
  projectKey: string;
  settings: ProjectSettings;
  createdAt: string;
}

export type SessionStatus = 'active' | 'completed' | 'processed';

export interface Session {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  userAgent: string | null;
  urlFirst: string | null;
  device: string | null;
  status: SessionStatus;
  eventCount: number;
  /** External referrer host, captured at session start. */
  referrer?: string | null;
  /** Per-session aggregates, computed once when the session is processed. */
  pageviews?: number | null;
  entryPage?: string | null;
  exitPage?: string | null;
  jsErrors?: number | null;
  maxScrollPct?: number | null;
  durationMs?: number | null;
  browser?: string | null;
  os?: string | null;
  isBot?: boolean | null;
  lcpMs?: number | null;
  inpMs?: number | null;
  cls?: number | null;
}
