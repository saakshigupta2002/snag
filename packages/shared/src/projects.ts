export interface ProjectSettings {
  /** Session retention window in days; pruning job enforces it. */
  retentionDays?: number;
  ai?: {
    enabled: boolean;
    /** Analyze at most this fraction of flagged groups when volume is high. */
    sampling?: number;
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
}
