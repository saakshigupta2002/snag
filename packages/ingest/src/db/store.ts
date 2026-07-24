import type {
  Analytics,
  CountRow,
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
  /** Resolve a project from its public demo slug, only if sharing is enabled. */
  getProjectByPublicId(publicId: string): Promise<Project | undefined>;
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
  /** Persist the per-session rollup computed during detection. */
  setSessionAggregates(sessionId: string, agg: SessionAggregates): Promise<void>;

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

const INSIGHT_DETECTORS: { detector: string; label: string }[] = [
  { detector: 'rage_click', label: 'Rage clicks' },
  { detector: 'dead_click', label: 'Dead clicks' },
  { detector: 'backward_navigation', label: 'Quick backs' },
  { detector: 'refresh_spam', label: 'Refresh spam' },
];

function bump(m: Map<string, number>, key: string | null | undefined): void {
  if (!key) return;
  m.set(key, (m.get(key) ?? 0) + 1);
}
function topCounts(m: Map<string, number>, k = 6): CountRow[] {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([key, count]) => ({ key, count }));
}
/** Web-Vitals bucket for one session: worst-of the three thresholds. */
function vitalsBucket(
  lcp: number | null | undefined,
  inp: number | null | undefined,
  cls: number | null | undefined,
): 'good' | 'needs' | 'poor' {
  const rate = (v: number | null | undefined, good: number, poor: number) =>
    v == null ? null : v <= good ? 0 : v <= poor ? 1 : 2;
  const scores = [rate(lcp, 2500, 4000), rate(inp, 200, 500), rate(cls, 0.1, 0.25)].filter(
    (x): x is number => x != null,
  );
  const worst = scores.length ? Math.max(...scores) : 0;
  return worst === 2 ? 'poor' : worst === 1 ? 'needs' : 'good';
}

/**
 * Session-centric analytics for the Clarity-style overview. Reuses
 * computeOverview for the issue trend / detectors / ingest health, then rolls
 * up the per-session aggregates persisted at seal time.
 */
export function computeAnalytics(
  issues: Issue[],
  sessions: Session[],
  days = 14,
  now = Date.now(),
): Analytics {
  const cutoff = now - days * DAY_MS;
  const recent = sessions.filter((s) => Date.parse(s.startedAt) >= cutoff);
  const ov = computeOverview(issues, recent, days, now);
  const n = recent.length;

  let totalPages = 0;
  let durSum = 0;
  let durN = 0;
  let scrollSum = 0;
  let scrollN = 0;
  let eventsTotal = 0;
  let jsErrTotal = 0;
  let sessWithErr = 0;
  let botCount = 0;
  let lcpSum = 0,
    lcpN = 0,
    inpSum = 0,
    inpN = 0,
    clsSum = 0,
    clsN = 0;
  let good = 0,
    needs = 0,
    poor = 0,
    vitalsN = 0;
  const device = new Map<string, number>();
  const browser = new Map<string, number>();
  const os = new Map<string, number>();
  const entry = new Map<string, number>();
  const exit = new Map<string, number>();
  const ref = new Map<string, number>();

  for (const s of recent) {
    eventsTotal += s.eventCount;
    totalPages += s.pageviews ?? 1;
    if (s.durationMs != null) {
      durSum += s.durationMs;
      durN++;
    }
    if (s.maxScrollPct != null) {
      scrollSum += s.maxScrollPct;
      scrollN++;
    }
    bump(device, s.device);
    bump(browser, s.browser);
    bump(os, s.os);
    bump(entry, s.entryPage ?? pageFromUrl(s.urlFirst));
    bump(exit, s.exitPage);
    bump(ref, s.referrer);
    if (s.jsErrors != null) {
      jsErrTotal += s.jsErrors;
      if (s.jsErrors > 0) sessWithErr++;
    }
    if (s.isBot) botCount++;
    if (s.lcpMs != null) {
      lcpSum += s.lcpMs;
      lcpN++;
    }
    if (s.inpMs != null) {
      inpSum += s.inpMs;
      inpN++;
    }
    if (s.cls != null) {
      clsSum += s.cls;
      clsN++;
    }
    if (s.lcpMs != null || s.inpMs != null || s.cls != null) {
      vitalsN++;
      const b = vitalsBucket(s.lcpMs, s.inpMs, s.cls);
      if (b === 'good') good++;
      else if (b === 'needs') needs++;
      else poor++;
    }
  }

  // Behaviour insights: distinct sessions per detector ÷ total sessions.
  const byDetector = new Map<string, Set<string>>();
  for (const i of issues) {
    if (!i.sessionId || Date.parse(i.createdAt) < cutoff) continue;
    let set = byDetector.get(i.detector);
    if (!set) byDetector.set(i.detector, (set = new Set()));
    set.add(i.sessionId);
  }
  const insights = INSIGHT_DETECTORS.map(({ detector, label }) => {
    const c = byDetector.get(detector)?.size ?? 0;
    return { detector, label, sessions: c, pct: n ? Math.round((c / n) * 1000) / 10 : 0 };
  });

  const sessionsOverTime = emptyDays(days, now);
  const sIdx = new Map(sessionsOverTime.map((b, i) => [b.day, i]));
  for (const s of recent) {
    const at = sIdx.get(dayKey(s.startedAt));
    if (at !== undefined) sessionsOverTime[at]!.count++;
  }

  const pct = (c: number) => (n ? Math.round((c / n) * 1000) / 10 : 0);
  const entryRows = topCounts(entry);

  return {
    days,
    kpis: {
      sessions: n,
      avgPagesPerSession: n ? Math.round((totalPages / n) * 10) / 10 : 0,
      avgDurationMs: durN ? Math.round(durSum / durN) : 0,
      avgScrollPct: scrollN ? Math.round(scrollSum / scrollN) : null,
      eventsTotal,
    },
    insights,
    device: topCounts(device),
    browser: topCounts(browser),
    os: topCounts(os),
    topPages: entryRows,
    entryPages: entryRows,
    exitPages: topCounts(exit),
    referrers: topCounts(ref),
    jsErrors: { total: jsErrTotal, sessionsWith: sessWithErr, pct: pct(sessWithErr) },
    bots: { sessions: botCount, pct: pct(botCount) },
    performance: {
      lcpMs: lcpN ? Math.round(lcpSum / lcpN) : null,
      inpMs: inpN ? Math.round(inpSum / inpN) : null,
      cls: clsN ? Math.round((clsSum / clsN) * 1000) / 1000 : null,
      score: vitalsN ? Math.round((good * 100 + needs * 50) / vitalsN) : null,
      good: vitalsN ? Math.round((good / vitalsN) * 100) : 0,
      needs: vitalsN ? Math.round((needs / vitalsN) * 100) : 0,
      poor: vitalsN ? Math.round((poor / vitalsN) * 100) : 0,
      sampleSize: vitalsN,
    },
    sessionsOverTime,
    issuesOverTime: ov.issuesOverTime,
    topDetectors: ov.topDetectors,
    ingest: ov.ingest,
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

function pageFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url, 'http://snag.local').pathname || '/';
  } catch {
    return url.split('?')[0] || null;
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

export function deviceFromUserAgent(ua?: string | null): string | null {
  if (!ua) return null;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)))
    return 'tablet';
  return /Mobi|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop';
}

export function browserFromUA(ua?: string | null): string | null {
  if (!ua) return null;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera/.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
  return 'Other';
}

export function osFromUA(ua?: string | null): string | null {
  if (!ua) return null;
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

/** Bare hostname of an external referrer, or null for empty/unparseable. */
export function referrerHost(ref?: string | null): string | null {
  if (!ref) return null;
  try {
    return new URL(ref).hostname || null;
  } catch {
    return null;
  }
}

export function isBotUA(ua?: string | null): boolean {
  if (!ua) return false;
  return /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|monitor|\bcurl\b|wget/i.test(
    ua,
  );
}

/** Per-session rollup computed once when the session is processed. */
export interface SessionAggregates {
  pageviews: number;
  entryPage: string | null;
  exitPage: string | null;
  jsErrors: number;
  maxScrollPct: number | null;
  durationMs: number | null;
  browser: string | null;
  os: string | null;
  isBot: boolean;
  lcpMs: number | null;
  inpMs: number | null;
  cls: number | null;
}
