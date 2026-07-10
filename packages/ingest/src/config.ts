export interface AiConfig {
  provider?: 'anthropic' | 'openai';
  apiKey?: string;
  model?: string;
  dailyCap: number;
}

export interface Config {
  port: number;
  databaseUrl?: string;
  /** Bearer token required on /api/* when set. /ingest is always key-based. */
  apiToken?: string;
  retentionDays: number;
  workerIntervalMs: number;
  /** A session with no events for this long is sealed and queued for detection. */
  sessionIdleMs: number;
  /**
   * Run detection inline when a session's final flush arrives, instead of
   * waiting for the interval worker. Required on serverless hosts (Vercel),
   * where no interval worker exists; harmless elsewhere.
   */
  processOnFinal: boolean;
  /** pg Pool size. Keep small (1–2) on serverless hosts. */
  pgPoolMax: number;
  ai: AiConfig;
}

function int(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = env.AI_PROVIDER === 'anthropic' || env.AI_PROVIDER === 'openai' ? env.AI_PROVIDER : undefined;
  return {
    port: int(env.PORT, 8787),
    databaseUrl: env.DATABASE_URL || undefined,
    apiToken: env.SNAG_API_TOKEN || undefined,
    retentionDays: int(env.RETENTION_DAYS, 30),
    workerIntervalMs: int(env.WORKER_INTERVAL_MS, 10_000),
    sessionIdleMs: int(env.SESSION_IDLE_MS, 30 * 60_000),
    processOnFinal: env.PROCESS_ON_FINAL === '1' || env.PROCESS_ON_FINAL === 'true',
    pgPoolMax: int(env.PG_POOL_MAX, 10),
    ai: {
      provider,
      apiKey: env.AI_API_KEY || undefined,
      model: env.AI_MODEL || undefined,
      dailyCap: int(env.AI_DAILY_CAP, 50),
    },
  };
}
