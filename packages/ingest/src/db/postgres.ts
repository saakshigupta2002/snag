import pg from 'pg';
import { SCHEMA } from './schema.js';
import type {
  FlagRule,
  Issue,
  IssueNote,
  IssueStatus,
  Project,
  ProjectSettings,
  RawEvent,
  Session,
  Severity,
} from '@snag/shared';
import {
  deviceFromUserAgent,
  newProjectKey,
  sessionDbId,
  type AiAnalysisRecord,
  type ChunkAppend,
  type NewFlagRule,
  type NewIssue,
  type ProjectWithStats,
  type Store,
} from './store.js';

type Row = Record<string, unknown>;

/**
 * Pull `sslmode` out of a connection string, touching only the query part so
 * credentials with special characters are never re-parsed. Returns the URL
 * without `sslmode` plus the value that was there (if any).
 */
function splitSslMode(databaseUrl: string): { url: string; sslmode?: string } {
  const q = databaseUrl.indexOf('?');
  if (q === -1) return { url: databaseUrl };
  const params = new URLSearchParams(databaseUrl.slice(q + 1));
  const sslmode = params.get('sslmode') ?? undefined;
  params.delete('sslmode');
  const rest = params.toString();
  return { url: rest ? `${databaseUrl.slice(0, q)}?${rest}` : databaseUrl.slice(0, q), sslmode };
}

function projectFromRow(r: Row): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    projectKey: String(r.project_key),
    settings: (r.settings ?? {}) as ProjectSettings,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  };
}

function sessionFromRow(r: Row): Session {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    startedAt: new Date(r.started_at as string | Date).toISOString(),
    endedAt: r.ended_at ? new Date(r.ended_at as string | Date).toISOString() : null,
    userAgent: (r.user_agent as string | null) ?? null,
    urlFirst: (r.url_first as string | null) ?? null,
    device: (r.device as string | null) ?? null,
    status: r.status as Session['status'],
    eventCount: Number(r.event_count ?? 0),
  };
}

function issueFromRow(r: Row): Issue {
  return {
    id: String(r.id),
    sessionId: (r.session_id as string | null) ?? null,
    projectId: String(r.project_id),
    detector: String(r.detector),
    severity: r.severity as Severity,
    tsStart: Number(r.ts_start),
    tsEnd: Number(r.ts_end),
    status: r.status as IssueStatus,
    groupKey: String(r.group_key),
    title: String(r.title),
    meta: (r.meta ?? {}) as Record<string, unknown>,
    occurrences: Number(r.occurrences ?? 1),
    note: (r.note as string | undefined) ?? undefined,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  };
}

function ruleFromRow(r: Row): FlagRule {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    detector: String(r.detector),
    kind: r.kind as FlagRule['kind'],
    enabled: Boolean(r.enabled),
    params: (r.params ?? {}) as Record<string, unknown>,
    createdAt: new Date(r.created_at as string | Date).toISOString(),
  };
}

/** Reference Store on managed Postgres (Supabase / Neon / RDS / docker db). */
export class PostgresStore implements Store {
  private pool: pg.Pool;

  constructor(databaseUrl: string, poolMax = 10) {
    // Managed Postgres hosts (Supabase, Neon, Heroku, RDS) present certs that
    // aren't in Node's default trust store, so full verification fails with
    // "self-signed certificate in certificate chain". Connect over TLS but
    // without chain verification — the documented setup for these hosts.
    //
    // We also strip `sslmode` from the connection string first: leaving it in
    // lets node-postgres apply its own stricter TLS policy that overrides the
    // ssl object below and re-triggers the verification error.
    const { url, sslmode } = splitSslMode(databaseUrl);
    const useSsl = sslmode
      ? sslmode !== 'disable'
      : !/@(localhost|127\.0\.0\.1)[:/]/.test(url);
    this.pool = new pg.Pool({
      connectionString: url,
      max: poolMax,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async one(sql: string, params: unknown[] = []): Promise<Row | undefined> {
    const res = await this.pool.query(sql, params);
    return res.rows[0] as Row | undefined;
  }

  async createProject(name: string): Promise<Project> {
    const row = await this.one(
      `INSERT INTO projects (name, project_key) VALUES ($1, $2) RETURNING *`,
      [name, newProjectKey()],
    );
    return projectFromRow(row!);
  }

  async listProjects(): Promise<ProjectWithStats[]> {
    const res = await this.pool.query(`
      SELECT p.*,
        (SELECT COUNT(DISTINCT i.group_key) FROM issues i
          WHERE i.project_id = p.id AND i.status = 'open') AS open_issues,
        (SELECT COUNT(*) FROM sessions s WHERE s.project_id = p.id) AS session_count
      FROM projects p ORDER BY p.created_at ASC`);
    return res.rows.map((r: Row) => ({
      ...projectFromRow(r),
      openIssues: Number(r.open_issues ?? 0),
      sessionCount: Number(r.session_count ?? 0),
    }));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const row = await this.one(`SELECT * FROM projects WHERE id = $1`, [id]).catch(() => undefined);
    return row ? projectFromRow(row) : undefined;
  }

  async getProjectByKey(projectKey: string): Promise<Project | undefined> {
    const row = await this.one(`SELECT * FROM projects WHERE project_key = $1`, [projectKey]);
    return row ? projectFromRow(row) : undefined;
  }

  async updateProject(
    id: string,
    patch: { name?: string; settings?: ProjectSettings },
  ): Promise<Project | undefined> {
    const row = await this.one(
      `UPDATE projects
         SET name = COALESCE($2, name),
             settings = settings || COALESCE($3::jsonb, '{}'::jsonb)
       WHERE id = $1 RETURNING *`,
      [id, patch.name ?? null, patch.settings ? JSON.stringify(patch.settings) : null],
    );
    return row ? projectFromRow(row) : undefined;
  }

  async appendChunk(chunk: ChunkAppend): Promise<void> {
    const sid = sessionDbId(chunk.projectId, chunk.clientSessionId);
    const ts = new Date(chunk.meta.ts || Date.now()).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO sessions (id, project_id, started_at, last_seen_at, user_agent, url_first, device, status, event_count)
         VALUES ($1, $2, $3, $3, $4, $5, $6, 'active', 0)
         ON CONFLICT (id) DO NOTHING`,
        [
          sid,
          chunk.projectId,
          ts,
          chunk.meta.userAgent ?? null,
          chunk.meta.url ?? null,
          chunk.meta.device ?? deviceFromUserAgent(chunk.meta.userAgent),
        ],
      );
      await client.query(
        `INSERT INTO event_chunks (session_id, seq_from, seq_to, events) VALUES ($1, $2, $3, $4)`,
        [sid, chunk.seqFrom, chunk.seqTo, JSON.stringify(chunk.events)],
      );
      await client.query(
        `UPDATE sessions SET
           event_count = event_count + $2,
           last_seen_at = GREATEST(last_seen_at, $3::timestamptz),
           ended_at = CASE WHEN $4 THEN $3::timestamptz ELSE ended_at END,
           status = CASE WHEN $4 AND status = 'active' THEN 'completed' ELSE status END
         WHERE id = $1`,
        [sid, chunk.events.length, ts, !!chunk.meta.final],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listSessions(projectId: string, limit = 100): Promise<Session[]> {
    const res = await this.pool.query(
      `SELECT * FROM sessions WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [projectId, limit],
    );
    return res.rows.map(sessionFromRow);
  }

  async getSession(sessionId: string): Promise<Session | undefined> {
    const row = await this.one(`SELECT * FROM sessions WHERE id = $1`, [sessionId]);
    return row ? sessionFromRow(row) : undefined;
  }

  async getSessionEvents(sessionId: string): Promise<RawEvent[]> {
    const res = await this.pool.query(
      `SELECT events FROM event_chunks WHERE session_id = $1 ORDER BY seq_from ASC`,
      [sessionId],
    );
    return res.rows.flatMap((r: Row) => r.events as RawEvent[]);
  }

  async sealIdleSessions(idleMs: number, now = Date.now()): Promise<number> {
    const cutoff = new Date(now - idleMs).toISOString();
    const res = await this.pool.query(
      `UPDATE sessions SET status = 'completed', ended_at = last_seen_at
       WHERE status = 'active' AND last_seen_at < $1`,
      [cutoff],
    );
    return res.rowCount ?? 0;
  }

  async takeCompletedSessions(limit: number): Promise<Session[]> {
    const res = await this.pool.query(
      `SELECT * FROM sessions WHERE status = 'completed' ORDER BY last_seen_at ASC LIMIT $1`,
      [limit],
    );
    return res.rows.map(sessionFromRow);
  }

  async markSessionProcessed(sessionId: string): Promise<void> {
    await this.pool.query(`UPDATE sessions SET status = 'processed' WHERE id = $1`, [sessionId]);
  }

  async insertIssues(newIssues: NewIssue[]): Promise<void> {
    for (const n of newIssues) {
      await this.pool.query(
        `INSERT INTO issues (session_id, project_id, detector, severity, ts_start, ts_end, status, group_key, title, meta, occurrences)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          n.sessionId,
          n.projectId,
          n.detector,
          n.severity,
          n.tsStart,
          n.tsEnd,
          n.status,
          n.groupKey,
          n.title,
          JSON.stringify(n.meta),
          n.occurrences,
        ],
      );
    }
  }

  async listIssues(projectId: string, limit = 5000): Promise<Issue[]> {
    const res = await this.pool.query(
      `SELECT * FROM (
         SELECT * FROM issues WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2
       ) sub ORDER BY created_at ASC`,
      [projectId, limit],
    );
    return res.rows.map(issueFromRow);
  }

  async issuesByGroup(projectId: string, groupKey: string): Promise<Issue[]> {
    const res = await this.pool.query(
      `SELECT * FROM issues WHERE project_id = $1 AND group_key = $2 ORDER BY created_at ASC`,
      [projectId, groupKey],
    );
    return res.rows.map(issueFromRow);
  }

  async setGroupStatus(
    projectId: string,
    groupKey: string,
    status: IssueStatus,
    note?: string,
  ): Promise<number> {
    const res = await this.pool.query(
      `UPDATE issues SET status = $3, note = COALESCE($4, note)
       WHERE project_id = $1 AND group_key = $2`,
      [projectId, groupKey, status, note ?? null],
    );
    return res.rowCount ?? 0;
  }

  async listFlagRules(projectId: string): Promise<FlagRule[]> {
    const res = await this.pool.query(
      `SELECT * FROM flag_rules WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId],
    );
    return res.rows.map(ruleFromRow);
  }

  async upsertFlagRule(rule: NewFlagRule): Promise<FlagRule> {
    const row = await this.one(
      `INSERT INTO flag_rules (project_id, detector, kind, enabled, params)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, detector)
       DO UPDATE SET enabled = EXCLUDED.enabled, params = EXCLUDED.params, kind = EXCLUDED.kind
       RETURNING *`,
      [rule.projectId, rule.detector, rule.kind, rule.enabled, JSON.stringify(rule.params)],
    );
    return ruleFromRow(row!);
  }

  async deleteFlagRule(projectId: string, ruleId: string): Promise<boolean> {
    const res = await this.pool.query(
      `DELETE FROM flag_rules WHERE project_id = $1 AND id = $2`,
      [projectId, ruleId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async pruneSessions(defaultRetentionDays: number, now = Date.now()): Promise<number> {
    // Per-project retention: settings.retentionDays overrides the default.
    const res = await this.pool.query(
      `DELETE FROM sessions s USING projects p
       WHERE s.project_id = p.id
         AND s.last_seen_at < to_timestamp($2::bigint / 1000.0)
             - make_interval(days => COALESCE((p.settings->>'retentionDays')::int, $1))`,
      [defaultRetentionDays, now],
    );
    // Issues from pruned sessions: confirmed rows survive (FK set them NULL at
    // insert of the delete); everything else that lost its session goes too.
    await this.pool.query(
      `DELETE FROM issues WHERE session_id IS NULL AND status <> 'confirmed'`,
    );
    return res.rowCount ?? 0;
  }

  async aiCallsToday(): Promise<number> {
    const row = await this.one(
      `SELECT COUNT(*)::int AS n FROM ai_analyses WHERE created_at >= date_trunc('day', now())`,
    );
    return Number(row?.n ?? 0);
  }

  async saveAiAnalysis(a: AiAnalysisRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_analyses (project_id, group_key, provider, model, summary, tokens)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, group_key)
       DO UPDATE SET summary = EXCLUDED.summary, tokens = EXCLUDED.tokens, created_at = now()`,
      [a.projectId, a.groupKey, a.provider, a.model, a.summary, a.tokens],
    );
  }

  async getAiSummaries(projectId: string): Promise<Record<string, string>> {
    const res = await this.pool.query(
      `SELECT group_key, summary FROM ai_analyses WHERE project_id = $1`,
      [projectId],
    );
    const out: Record<string, string> = {};
    for (const r of res.rows as Row[]) out[String(r.group_key)] = String(r.summary);
    return out;
  }

  async hasAiAnalysis(projectId: string, groupKey: string): Promise<boolean> {
    const row = await this.one(
      `SELECT 1 FROM ai_analyses WHERE project_id = $1 AND group_key = $2`,
      [projectId, groupKey],
    );
    return !!row;
  }

  async existingGroupKeys(projectId: string): Promise<Set<string>> {
    const res = await this.pool.query(
      `SELECT DISTINCT group_key FROM issues WHERE project_id = $1`,
      [projectId],
    );
    return new Set(res.rows.map((r: Row) => String(r.group_key)));
  }

  async addIssueNote(
    projectId: string,
    groupKey: string,
    action: IssueNote['action'],
    note: string | null,
  ): Promise<IssueNote> {
    const clean = note && note.trim() ? note.trim() : null;
    const row = await this.one(
      `INSERT INTO issue_notes (project_id, group_key, action, note)
       VALUES ($1, $2, $3, $4) RETURNING id, action, note, created_at`,
      [projectId, groupKey, action, clean],
    );
    return {
      id: String(row!.id),
      action: row!.action as IssueNote['action'],
      note: (row!.note as string | null) ?? null,
      createdAt: new Date(row!.created_at as string | Date).toISOString(),
    };
  }

  async getIssueNotes(projectId: string, groupKey: string): Promise<IssueNote[]> {
    const res = await this.pool.query(
      `SELECT id, action, note, created_at FROM issue_notes
       WHERE project_id = $1 AND group_key = $2 ORDER BY created_at DESC`,
      [projectId, groupKey],
    );
    return res.rows.map((r: Row) => ({
      id: String(r.id),
      action: r.action as IssueNote['action'],
      note: (r.note as string | null) ?? null,
      createdAt: new Date(r.created_at as string | Date).toISOString(),
    }));
  }
}
