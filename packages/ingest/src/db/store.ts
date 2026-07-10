import type {
  FlagRule,
  IngestPayload,
  Issue,
  IssueGroup,
  IssueStatus,
  Project,
  ProjectSettings,
  RawEvent,
  Session,
  Severity,
} from '@snag/shared';

export interface NewIssue {
  sessionId: string | null;
  projectId: string;
  detector: string;
  severity: Severity;
  tsStart: number;
  tsEnd: number;
  status: IssueStatus;
  groupKey: string;
  title: string;
  meta: Record<string, unknown>;
  occurrences: number;
}

export interface ChunkAppend {
  projectId: string;
  /** Client-generated session id; scoped internally as `${projectId}:${id}`. */
  clientSessionId: string;
  events: RawEvent[];
  seqFrom: number;
  seqTo: number;
  meta: IngestPayload['meta'];
}

export interface ProjectWithStats extends Project {
  openIssues: number;
  sessionCount: number;
}

export interface NewFlagRule {
  projectId: string;
  detector: string;
  kind: FlagRule['kind'];
  enabled: boolean;
  params: Record<string, unknown>;
}

export interface AiAnalysisRecord {
  projectId: string;
  /** Group key of the analyzed issue group, or a kindb:<rule>:<session> key. */
  groupKey: string;
  provider: string;
  model: string;
  summary: string;
  tokens: number;
}

/**
 * Storage seam. Postgres is the reference implementation; the in-memory
 * store backs tests and keeps vendor-specific code swappable (the
 * architecture is deliberately portable).
 */
export interface Store {
  init(): Promise<void>;
  close(): Promise<void>;

  createProject(name: string): Promise<Project>;
  listProjects(): Promise<ProjectWithStats[]>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectByKey(projectKey: string): Promise<Project | undefined>;
  updateProject(
    id: string,
    patch: { name?: string; settings?: ProjectSettings },
  ): Promise<Project | undefined>;

  appendChunk(chunk: ChunkAppend): Promise<void>;
  listSessions(projectId: string, limit?: number): Promise<Session[]>;
  getSession(sessionId: string): Promise<Session | undefined>;
  getSessionEvents(sessionId: string): Promise<RawEvent[]>;
  sealIdleSessions(idleMs: number, now?: number): Promise<number>;
  takeCompletedSessions(limit: number): Promise<Session[]>;
  markSessionProcessed(sessionId: string): Promise<void>;

  insertIssues(issues: NewIssue[]): Promise<void>;
  listIssues(projectId: string, limit?: number): Promise<Issue[]>;
  issuesByGroup(projectId: string, groupKey: string): Promise<Issue[]>;
  setGroupStatus(
    projectId: string,
    groupKey: string,
    status: IssueStatus,
    note?: string,
  ): Promise<number>;

  listFlagRules(projectId: string): Promise<FlagRule[]>;
  upsertFlagRule(rule: NewFlagRule): Promise<FlagRule>;
  deleteFlagRule(projectId: string, ruleId: string): Promise<boolean>;

  /** Delete sessions past each project's retention window (default given). */
  pruneSessions(defaultRetentionDays: number, now?: number): Promise<number>;

  aiCallsToday(): Promise<number>;
  saveAiAnalysis(a: AiAnalysisRecord): Promise<void>;
  /** groupKey → summary for a project (latest per group). */
  getAiSummaries(projectId: string): Promise<Record<string, string>>;
  hasAiAnalysis(projectId: string, groupKey: string): Promise<boolean>;
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

/**
 * Collapse issue rows into one group per underlying problem. The dashboard
 * shows the group; occurrences and session counts quantify the blast radius.
 */
export function groupIssues(issues: Issue[], aiSummaries: Record<string, string> = {}): IssueGroup[] {
  const byKey = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byKey.get(issue.groupKey) ?? [];
    list.push(issue);
    byKey.set(issue.groupKey, list);
  }

  const groups: IssueGroup[] = [];
  for (const [groupKey, rows] of byKey) {
    rows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const newest = rows[rows.length - 1]!;
    // Prefer a sample whose session (and therefore replay) still exists.
    const sample = [...rows].reverse().find((r) => r.sessionId) ?? newest;
    const severity = rows.reduce<Severity>(
      (acc, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[acc] ? r.severity : acc),
      'low',
    );
    // Confirmed sticks; a new open row resurfaces a dismissed group.
    const status: IssueStatus = rows.some((r) => r.status === 'confirmed')
      ? 'confirmed'
      : rows.some((r) => r.status === 'open')
        ? 'open'
        : 'dismissed';
    groups.push({
      groupKey,
      detector: newest.detector,
      severity,
      title: sample.title,
      status,
      occurrences: rows.reduce((n, r) => n + (r.occurrences || 1), 0),
      sessionCount: new Set(rows.map((r) => r.sessionId).filter(Boolean)).size,
      firstSeen: rows[0]!.createdAt,
      lastSeen: newest.createdAt,
      sample,
      aiSummary: aiSummaries[groupKey],
    });
  }

  groups.sort((a, b) => {
    const sev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sev !== 0) return sev;
    return a.lastSeen < b.lastSeen ? 1 : -1;
  });
  return groups;
}

export function sessionDbId(projectId: string, clientSessionId: string): string {
  return `${projectId}:${clientSessionId}`;
}

export function newProjectKey(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `pk_live_${s}`;
}

export function deviceFromUserAgent(ua?: string): string | null {
  if (!ua) return null;
  return /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
}
