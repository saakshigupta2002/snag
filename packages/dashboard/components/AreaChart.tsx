'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { TrendPoint } from '@snag/shared';

/**
 * A proper time-series area chart: y-axis with nice ticks + dashed gridlines,
 * x-axis day labels, a smooth teal area, point markers, and a hover crosshair
 * with a tooltip. Single-hue magnitude (teal) — no categorical palette.
 * Sizes to its container via ResizeObserver so text stays crisp.
 */
export function AreaChart({
  data,
  height = 200,
  yLabel,
  accent = 'var(--teal)',
}: {
  data: TrendPoint[];
  height?: number;
  yLabel?: string;
  accent?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const gid = `ac-${useId().replace(/[^a-z0-9]/gi, '')}`;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 600));
    ro.observe(el);
    setWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) {
    return (
      <div ref={wrapRef} className="muted" style={{ fontSize: 12.5, padding: '20px 0' }}>
        Not enough data yet — check back after a few more sessions.
      </div>
    );
  }

  const padL = yLabel ? 40 : 30;
  const padB = 24;
  const padT = 10;
  const padR = 12;
  const plotW = Math.max(width - padL - padR, 10);
  const plotH = height - padT - padB;

  const rawMax = Math.max(...data.map((d) => d.count), 1);
  const niceMax = niceCeil(rawMax);
  const ticks = tickValues(niceMax);

  const x = (i: number) => padL + (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - (v / niceMax) * plotH;

  // Smooth line via horizontal-midpoint cubics (no vertical overshoot).
  let line = `M ${x(0).toFixed(1)} ${y(data[0]!.count).toFixed(1)}`;
  for (let i = 1; i < data.length; i++) {
    const xm = (x(i - 1) + x(i)) / 2;
    line += ` C ${xm.toFixed(1)} ${y(data[i - 1]!.count).toFixed(1)} ${xm.toFixed(1)} ${y(data[i]!.count).toFixed(1)} ${x(i).toFixed(1)} ${y(data[i]!.count).toFixed(1)}`;
  }
  const area = `${line} L ${x(data.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  // Label density: show ~10 x-labels max.
  const step = Math.ceil(data.length / 10);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - padL) / plotW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const hv = hover !== null ? data[hover]! : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.26" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" className="ac-axis">
              {t}
            </text>
          </g>
        ))}

        {/* x labels */}
        {data.map((d, i) =>
          i % step === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={height - 7} textAnchor="middle" className="ac-axis">
              {d.day.slice(8)}
            </text>
          ) : null,
        )}

        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* markers */}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.count)} r="2.6" fill={accent} opacity={hover === i ? 1 : 0.55} />
        ))}

        {/* hover crosshair + point */}
        {hv && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={padT} y2={padT + plotH} stroke={accent} strokeOpacity="0.35" />
            <circle cx={x(hover!)} cy={y(hv.count)} r="4.5" fill={accent} />
            <circle cx={x(hover!)} cy={y(hv.count)} r="8" fill="none" stroke={accent} strokeOpacity="0.3" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {yLabel && <div className="ac-ylabel">{yLabel}</div>}

      {hv && (
        <div
          className="ac-tip mono"
          style={{ left: `${(x(hover!) / width) * 100}%`, top: y(hv.count) - 8 }}
        >
          <strong>{hv.count}</strong> · {hv.day.slice(5)}
        </div>
      )}
    </div>
  );
}

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const step = pow / 2;
  return Math.ceil(n / step) * step;
}
function tickValues(max: number): number[] {
  const count = 4;
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(step * i));
}
