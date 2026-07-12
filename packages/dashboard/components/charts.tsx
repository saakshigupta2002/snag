import type { CountRow, TrendPoint } from '@snag/shared';

/**
 * Minimal inline-SVG charts, styled for the teal console. Single-hue (teal)
 * magnitude marks — no categorical palette to validate. Area fill with an
 * emphasized endpoint; horizontal bars use one hue scaled by value.
 */
export function Sparkline({
  data,
  width = 560,
  height = 68,
  stroke = 'var(--teal)',
}: {
  data: TrendPoint[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) return <div className="muted" style={{ fontSize: 12.5 }}>Not enough data yet.</div>;
  const max = Math.max(1, ...data.map((d) => d.count));
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const x = (i: number) => pad + (i / (data.length - 1)) * w;
  const y = (v: number) => pad + h - (v / max) * h;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.count).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${(pad + h).toFixed(1)} L ${x(0).toFixed(1)} ${(pad + h).toFixed(1)} Z`;
  const lastX = x(data.length - 1);
  const lastY = y(data[data.length - 1]!.count);
  const gid = `sg-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3.4" fill={stroke} />
      <circle cx={lastX} cy={lastY} r="6.5" fill="none" stroke={stroke} strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}

export function BarList({ rows, accent = 'var(--teal)' }: { rows: CountRow[]; accent?: string }) {
  if (!rows.length) return <div className="muted" style={{ fontSize: 12.5 }}>Nothing yet.</div>;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="barlist">
      {rows.map((r) => (
        <div className="barrow" key={r.key}>
          <div className="barrow-track">
            <div
              className="barrow-fill"
              style={{ width: `${(r.count / max) * 100}%`, background: accent }}
            />
            <span className="barrow-label mono">{r.key}</span>
          </div>
          <span className="barrow-count mono">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
