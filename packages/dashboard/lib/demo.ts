import { api, ApiError } from './api';

export interface DemoProject {
  id: string;
  name: string;
  publicId: string;
}

/**
 * Resolve a public demo project by its share slug. Returns null (→ 404) unless
 * the owner has enabled sharing. Runs server-side with the ingest token; the
 * public viewer never sees it.
 */
export async function resolveDemo(publicId: string): Promise<DemoProject | null> {
  try {
    return await api<DemoProject>(`/api/public-projects/${encodeURIComponent(publicId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
