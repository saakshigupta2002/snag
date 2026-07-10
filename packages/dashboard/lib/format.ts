export function timeAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function duration(startIso: string, endIso: string | null): string {
  if (!endIso) return '—';
  const s = Math.max(Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000), 0);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function pathOfUrl(url: string | null): string {
  if (!url) return '—';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}
