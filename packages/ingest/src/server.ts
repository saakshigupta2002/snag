import { loadConfig } from './config.js';
import { MemoryStore } from './db/memory.js';
import { PostgresStore } from './db/postgres.js';
import type { Store } from './db/store.js';
import { buildApp } from './app.js';
import { startWorker } from './worker.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const store: Store = config.databaseUrl
    ? new PostgresStore(config.databaseUrl)
    : new MemoryStore();
  if (!config.databaseUrl) {
    console.warn('[snag] DATABASE_URL not set — using in-memory storage (data is lost on restart)');
  }
  await store.init();

  const app = buildApp(store, config);
  const stopWorker = startWorker(store, config);

  const shutdown = async () => {
    stopWorker();
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[snag] ingest listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
