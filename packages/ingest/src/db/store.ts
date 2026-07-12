import type {
  DetectorStat,
  FlagRule,
  IngestHealth,
  IngestPayload,
  Issue,
  IssueGroup,
  IssueNote,
  IssueStatus,
  Overview,
  Project,
  ProjectSettings,
  RawEvent,
  Session,
  Severity,
  TrendPoint,
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

  /** Distinct group keys already seen for a project (to detect new issues). */
  existingGroupKeys(projectId: string): Promise<Set<string>>;
  /** Append a triage note / status-change event to an issue group. */
  addIssueNote(
    projectId: string,
    groupKey: string,
    action: IssueNote['action'],
    note: string | null,
  ): Promise<IssueNote>;
  getIssueNotes(projectId: string, groupKey: string): Promise<IssueNote[]>;
}

const DAY_MS = 86_400_000;
const SEVERITY_RANK_MAP: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

function dayKey(iso: string, now = Date.now()): string {
  void now;
  return new Date(iso).toISOString().slice(0, 10);
}

/** Build the last `days` day-buckets (oldest→newest), zero-filled. */
function emptyDays(days: number, now = Date.now()): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({ day: new Date(now - i * DAY_MS).toISOString().slice(0, 10), count: 0 });
  }
  return out;
}

/**
 * Compute the whole overview payload from raw issues + sessions in JS, so both
 * the in-memory and Postgres stores share one implementation. Grouping matches
 * the dashboard: one row per (groupKey), first-seen anchors the day bucket.
 */
export function computeOverview(
  issues: Issue[],
  sessions: Session[],
  days = 14,
  now = Date.now(),
): Overview {
  const groups = new Map<string, { first: string; severity: Severity; detector: string; status: IssueStatus; page: string }>();
  for (const i of issues) {
    const g = groups.get(i.groupKey);
    const page = pageOf(i);
    if (!g) {
      groups.set(i.groupKey, {
        first: i.createdAt,
        severity: i.severity,
        detector: i.detector,
        status: i.status,
        page,
      });
    } else {
      if (i.createdAt < g.first) g.first = i.createdAt;
      if (SEVERITY_RANK_MAP[i.severity] > SEVERITY_RANK_MAP[g.severity]) g.severity = i.severity;
      if (i.status === 'confirmed') g.status = 'confirmed';
      else if (i.status === 'open' && g.status !== 'confirmed') g.status = 'open';
    }
  }

  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  const detectorCounts = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  const buckets = emptyDays(days, now);
  const bucketIndex = new Map(buckets.map((b, i) => [b.day, i]));
  const cutoff = now - days * DAY_MS;

  let openIssues = 0;
  let confirmedIssues = 0;
  for (const g of groups.values()) {
    if (g.status === 'open') {
      openIssues++;
      bySeverity[g.severity]++;
      detectorCounts.set(g.detector, (detectorCounts.get(g.detector) ?? 0) + 1);
      if (g.page) pageCounts.set(g.page, (pageCounts.get(g.page) ?? 0) + 1);
    }
    if (g.status === 'confirmed') confirmedIssues++;
    if (Date.parse(g.first) >= cutoff) {
      const idx = bucketIndex.get(dayKey(g.first));
      if (idx !== undefined) buckets[idx]!.count++;
    }
  }

  const topN = (m: Map<string, number>): { key: string; count: number }[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => ({ key, count }));

  return {
    totals: { openIssues, confirmedIssues, sessions: sessions.length, issueGroups: groups.size },
    bySeverity,
    issuesOverTime: buckets,
    topDetectors: topN(detectorCounts),
    topPages: topN(pageCounts),
    ingest: computeIngestHealth(sessions, now),
  };
}

export function computeIngestHealth(sessions: Session[], now = Date.now()): IngestHealth {
  let lastMs = 0;
  let eventsTotal = 0;
  let sessionsToday = 0;
  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  for (const s of sessions) {
    eventsTotal += s.eventCount;
    const ts = Date.parse(s.startedAt);
    if (ts > lastMs) lastMs = ts;
    if (ts >= startOfDay) sessionsToday++;
  }
  return {
    lastSessionAt: lastMs ? new Date(lastMs).toISOString() : null,
    sessionsToday,
    eventsTotal,
    minutesSinceLast: lastMs ? Math.floor((now - lastMs) / 60_000) : null,
  };
}

/** Per-day occurrence trend for one issue group (its own created_at buckets). */
export function computeTrend(issues: Issue[], groupKey: string, days = 14, now = Date.now()): TrendPoint[] {
  const buckets = emptyDays(days, now);
  const idx = new Map(buckets.map((b, i) => [b.day, i]));
  const cutoff = now - days * DAY_MS;
  for (const i of issues) {
    if (i.groupKey !== groupKey) continue;
    if (Date.parse(i.createdAt) < cutoff) continue;
    const at = idx.get(dayKey(i.createdAt));
    if (at !== undefined) buckets[at]!.count += i.occurrences || 1;
  }
  return buckets;
}

export function computeDetectorStats(issues: Issue[]): DetectorStat[] {
  const byDetector = new Map<string, { groups: Map<string, IssueStatus> }>();
  for (const i of issues) {
    const d = byDetector.get(i.detector) ?? { groups: new Map() };
    // Latest status wins per group (issues arrive oldest→newest).
    const prev = d.groups.get(i.groupKey);
    d.groups.set(i.groupKey, i.status === 'confirmed' ? 'confirmed' : (prev ?? i.status));
    byDetector.set(i.detector, d);
  }
  return [...byDetector.entries()]
    .map(([detector, { groups }]) => {
      let confirmed = 0;
      let dismissed = 0;
      for (const st of groups.values()) {
        if (st === 'confirmed') confirmed++;
        else if (st === 'dismissed') dismissed++;
      }
      return { detector, fired: groups.size, confirmed, dismissed };
    })
    .sort((a, b) => b.fired - a.fired);
}

function pageOf(issue: Issue): string {
  const meta = issue.meta as { url?: string; page?: string };
  const raw = meta.page || meta.url || '';
  if (!raw) return '';
  try {
    return new URL(raw, 'http://snag.local').pathname || '/';
  } catch {
    return raw.split('?')[0] || '';
  }
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
