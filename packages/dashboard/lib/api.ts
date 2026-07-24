/**
 * Server-side client for the ingest management API. The dashboard proxies
 * every call so SNAG_API_TOKEN never reaches the browser.
 */
const INGEST_URL = (process.env.INGEST_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (process.env.SNAG_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.SNAG_API_TOKEN}`;
  }
  const res = await fetch(`${INGEST_URL}${path}`, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    throw new ApiError(res.status, `${init.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * Cached read for expensive, read-only analytics (overview, heatmaps). Next's
 * data cache serves repeat navigations from memory for `revalidate` seconds,
 * so the dashboard doesn't recompute + round-trip to the ingest every time.
 */
export async function apiCached<T>(path: string, revalidate = 15): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.SNAG_API_TOKEN) {
    headers.authorization = `Bearer ${process.env.SNAG_API_TOKEN}`;
  }
  const res = await fetch(`${INGEST_URL}${path}`, { headers, next: { revalidate } });
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}
