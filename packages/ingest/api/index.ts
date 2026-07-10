// Vercel entry: the whole Fastify app behind one function.
// vercel.json routes every path here with the original URL intact.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getApp } from '../src/serverless.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
