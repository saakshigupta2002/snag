import { randomUUID } from 'node:crypto';
import type {
  FlagRule,
  Issue,
  IssueNote,
  IssueStatus,
  Project,
  ProjectSettings,
  RawEvent,
  Session,
} from '@snag/shared';
import {
  deviceFromUserAgent,
  referrerHost,
  newProjectKey,
  sessionDbId,
  type AiAnalysisRecord,
  type ChunkAppend,
  type SessionAggregates,
  type NewFlagRule,
  type NewIssue,
  type ProjectWithStats,
  type Store,
} from './store.js';

interface Chunk {
  sessionId: string;
  seqFrom: number;
  events: RawEvent[];
}

/** In-memory Store: backs tests and quick local hacking. Not for production. */
export class MemoryStore implements Store {
  private projects = new Map<string, Project>();
  private sessions = new Map<string, Session & { lastSeenAt: string }>();
  private chunks: Chunk[] = [];
  private issues = new Map<string, Issue>();
  private flagRules = new Map<string, FlagRule>();
  private aiAnalyses = new Map<string, AiAnalysisRecord & { createdAt: string }>();
  private notes = new Map<string, IssueNote[]>(); // key = `${projectId}|${groupKey}`

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async createProject(name: string): Promise<Project> {
    const project: Project = {
      id: randomUUID(),
      name,
      projectKey: newProjectKey(),
      settings: {},
      createdAt: new Date().toISOString(),
    };
    this.projects.set(project.id, project);
    return project;
  }

  async listProjects(): Promise<ProjectWithStats[]> {
    const all = [...this.projects.values()];
    return all.map((p) => ({
      ...p,
      openIssues: new Set(
        [...this.issues.values()]
          .filter((i) => i.projectId === p.id && i.status === 'open')
          .map((i) => i.groupKey),
      ).size,
      sessionCount: [...this.sessions.values()].filter((s) => s.projectId === p.id).length,
    }));
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async getProjectByKey(projectKey: string): Promise<Project | undefined> {
    return [...this.projects.values()].find((p) => p.projectKey === projectKey);
  }

  async getProjectByPublicId(publicId: string): Promise<Project | undefined> {
    return [...this.projects.values()].find(
      (p) => p.settings.share?.enabled && p.settings.share.publicId === publicId,
    );
  }

  async updateProject(
    id: string,
    patch: { name?: string; settings?: ProjectSettings },
  ): Promise<Project | undefined> {
    const p = this.projects.get(id);
    if (!p) return undefined;
    if (patch.name) p.name = patch.name;
    if (patch.settings) p.settings = { ...p.settings, ...patch.settings };
    return p;
  }

  async appendChunk(chunk: ChunkAppend): Promise<void> {
    const sid = sessionDbId(chunk.projectId, chunk.clientSessionId);
    const nowIso = new Date(chunk.meta.ts || Date.now()).toISOString();
    let session = this.sessions.get(sid);
    if (!session) {
      session = {
        id: sid,
        projectId: chunk.projectId,
        startedAt: nowIso,
        endedAt: null,
        userAgent: chunk.meta.userAgent ?? null,
        urlFirst: chunk.meta.url ?? null,
        device: chunk.meta.device ?? deviceFromUserAgent(chunk.meta.userAgent),
        referrer: referrerHost(chunk.meta.referrer),
        visitorId: chunk.meta.visitorId ?? null,
        country: chunk.country ?? null,
        status: 'active',
        eventCount: 0,
        lastSeenAt: nowIso,
      };
      this.sessions.set(sid, session);
    }
    this.chunks.push({ sessionId: sid, seqFrom: chunk.seqFrom, events: chunk.events });
    session.eventCount += chunk.events.length;
    session.lastSeenAt = nowIso;
    if (chunk.meta.final) {
      session.endedAt = nowIso;
      if (session.status === 'active') session.status = 'completed';
    }
  }

  async listSessions(projectId: string, limit = 100): Promise<Session[]> {
    return [...this.sessions.values()]
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit)
      .map(({ lastSeenAt: _drop, ...s }) => s);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const s = this.sessions.get(sessionId);
    if (!s) return undefined;
    const { lastSeenAt: _drop, ...rest } = s;
    return rest;
  }

  async getSessionEvents(sessionId: string): Promise<RawEvent[]> {
    return this.chunks
      .filter((c) => c.sessionId === sessionId)
      .sort((a, b) => a.seqFrom - b.seqFrom)
      .flatMap((c) => c.events);
  }

  async sealIdleSessions(idleMs: number, now = Date.now()): Promise<number> {
    let sealed = 0;
    for (const s of this.sessions.values()) {
      if (s.status === 'active' && now - Date.parse(s.lastSeenAt) >= idleMs) {
        s.status = 'completed';
        s.endedAt = s.lastSeenAt;
        sealed++;
      }
    }
    return sealed;
  }

  async takeCompletedSessions(limit: number): Promise<Session[]> {
    return [...this.sessions.values()]
      .filter((s) => s.status === 'completed')
      .slice(0, limit)
      .map(({ lastSeenAt: _drop, ...s }) => s);
  }

  async markSessionProcessed(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) s.status = 'processed';
  }

  async setSessionAggregates(sessionId: string, agg: SessionAggregates): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) Object.assign(s, agg);
  }

  async insertIssues(newIssues: NewIssue[]): Promise<void> {
    for (const n of newIssues) {
      const issue: Issue = { ...n, id: randomUUID(), createdAt: new Date().toISOString() };
      this.issues.set(issue.id, issue);
    }
  }

  async listIssues(projectId: string, limit = 5000): Promise<Issue[]> {
    return [...this.issues.values()]
      .filter((i) => i.projectId === projectId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(-limit);
  }

  async issuesByGroup(projectId: string, groupKey: string): Promise<Issue[]> {
    return [...this.issues.values()]
      .filter((i) => i.projectId === projectId && i.groupKey === groupKey)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async setGroupStatus(
    projectId: string,
    groupKey: string,
    status: IssueStatus,
    note?: string,
  ): Promise<number> {
    let n = 0;
    for (const issue of this.issues.values()) {
      if (issue.projectId === projectId && issue.groupKey === groupKey) {
        issue.status = status;
        if (note !== undefined) issue.note = note;
        n++;
      }
    }
    return n;
  }

  async listFlagRules(projectId: string): Promise<FlagRule[]> {
    return [...this.flagRules.values()].filter((r) => r.projectId === projectId);
  }

  async upsertFlagRule(rule: NewFlagRule): Promise<FlagRule> {
    const existing = [...this.flagRules.values()].find(
      (r) => r.projectId === rule.projectId && r.detector === rule.detector,
    );
    if (existing) {
      existing.enabled = rule.enabled;
      existing.params = rule.params;
      existing.kind = rule.kind;
      return existing;
    }
    const created: FlagRule = { ...rule, id: randomUUID(), createdAt: new Date().toISOString() };
    this.flagRules.set(created.id, created);
    return created;
  }

  async deleteFlagRule(projectId: string, ruleId: string): Promise<boolean> {
    const r = this.flagRules.get(ruleId);
    if (!r || r.projectId !== projectId) return false;
    this.flagRules.delete(ruleId);
    return true;
  }

  async pruneSessions(defaultRetentionDays: number, now = Date.now()): Promise<number> {
    let pruned = 0;
    for (const [sid, s] of this.sessions) {
      const project = this.projects.get(s.projectId);
      const days = project?.settings.retentionDays ?? defaultRetentionDays;
      if (now - Date.parse(s.lastSeenAt) < days * 86_400_000) continue;
      this.sessions.delete(sid);
      this.chunks = this.chunks.filter((c) => c.sessionId !== sid);
      for (const [id, issue] of this.issues) {
        if (issue.sessionId !== sid) continue;
        // Confirmed issues outlive their raw session data.
        if (issue.status === 'confirmed') issue.sessionId = null;
        else this.issues.delete(id);
      }
      pruned++;
    }
    return pruned;
  }

  async aiCallsToday(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return [...this.aiAnalyses.values()].filter((a) => a.createdAt.startsWith(today)).length;
  }

  async saveAiAnalysis(a: AiAnalysisRecord): Promise<void> {
    this.aiAnalyses.set(`${a.projectId}|${a.groupKey}`, {
      ...a,
      createdAt: new Date().toISOString(),
    });
  }

  async getAiSummaries(projectId: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const a of this.aiAnalyses.values()) {
      if (a.projectId === projectId) out[a.groupKey] = a.summary;
    }
    return out;
  }

  async hasAiAnalysis(projectId: string, groupKey: string): Promise<boolean> {
    return this.aiAnalyses.has(`${projectId}|${groupKey}`);
  }

  async existingGroupKeys(projectId: string): Promise<Set<string>> {
    const set = new Set<string>();
    for (const i of this.issues.values()) if (i.projectId === projectId) set.add(i.groupKey);
    return set;
  }

  async addIssueNote(
    projectId: string,
    groupKey: string,
    action: IssueNote['action'],
    note: string | null,
  ): Promise<IssueNote> {
    const key = `${projectId}|${groupKey}`;
    const entry: IssueNote = {
      id: randomUUID(),
      action,
      note: note && note.trim() ? note.trim() : null,
      createdAt: new Date().toISOString(),
    };
    const list = this.notes.get(key) ?? [];
    list.push(entry);
    this.notes.set(key, list);
    return entry;
  }

  async getIssueNotes(projectId: string, groupKey: string): Promise<IssueNote[]> {
    return [...(this.notes.get(`${projectId}|${groupKey}`) ?? [])].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }
}
