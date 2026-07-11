// Vercel entry: the whole Fastify app behind one function.
// vercel.json rewrites every path here with the original URL intact.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApp } from '../src/serverless.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const app = await getApp();
    await app.ready();
    // Keep the invocation alive until Fastify has finished the response —
    // returning before res is done makes Vercel report a failed invocation.
    const done = new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
    });
    app.server.emit('request', req, res);
    await done;
  } catch (err) {
    // Surface boot/DB errors as a clean 500 (and log the stack) instead of a
    // generic Vercel crash, so misconfiguration is diagnosable during setup.
    console.error('[snag] function invocation failed', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'ingest failed to start',
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
