import type { FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { MemoryStore } from './db/memory.js';
import { PostgresStore } from './db/postgres.js';
import type { Store } from './db/store.js';
import { buildApp } from './app.js';

let appPromise: Promise<FastifyInstance> | undefined;

/**
 * Serverless variant of server.ts: no interval worker, so
 *  - detection runs inline on each session's final flush (processOnFinal),
 *  - a scheduler (e.g. Vercel Cron → GET /api/admin/tick) covers idle
 *    sealing, retention pruning, and the AI pass.
 * The app + pool are cached per function instance across invocations.
 */
export function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = build().catch((err) => {
      // Don't cache a rejected promise — let the next invocation retry
      // (e.g. after a transient DB hiccup) instead of failing forever.
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

async function build(): Promise<FastifyInstance> {
  const config = loadConfig();
  if (process.env.PROCESS_ON_FINAL === undefined) config.processOnFinal = true;
  if (process.env.PG_POOL_MAX === undefined) config.pgPoolMax = 2;

  const store: Store = config.databaseUrl
    ? new PostgresStore(config.databaseUrl, config.pgPoolMax)
    : new MemoryStore();
  if (!config.databaseUrl) {
    console.warn('[snag] DATABASE_URL not set — in-memory store will not survive between invocations');
  }
  await store.init();
  const app = buildApp(store, config);
  await app.ready();
  return app;
}
