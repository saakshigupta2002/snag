'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Replayer as ReplayerType } from 'rrweb';
import { isSnagEvent, RRWEB_TYPE, type RawEvent } from '@snag/shared';
import 'rrweb/dist/style.css';

interface Marker {
  offset: number;
  kind: 'error' | 'network' | 'flag';
  label: string;
}
interface Ev {
  offset: number;
  kind: 'console' | 'error' | 'network' | 'navigation' | 'click' | 'form';
  text: string;
  bad: boolean;
}

const SPEEDS = [1, 2, 4, 8];

export function SessionReplay({
  sessionId,
  flagTsStart,
  flagTsEnd,
  preRollMs = 5000,
  withEvidence = false,
}: {
  sessionId: string;
  flagTsStart?: number;
  flagTsEnd?: number;
  preRollMs?: number;
  withEvidence?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<ReplayerType | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [totalMs, setTotalMs] = useState(0);
  const [posMs, setPosMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [evidence, setEvidence] = useState<Ev[]>([]);

  const fit = useCallback((stage: HTMLDivElement, w: number, h: number) => {
    const wrap = stage.querySelector<HTMLElement>('.replayer-wrapper');
    if (!wrap || !w) return;
    const scale = Math.min((stage.clientWidth || 900) / w, 1);
    wrap.style.transform = `scale(${scale})`;
    wrap.style.transformOrigin = 'top left';
    stage.style.height = `${Math.round(h * scale)}px`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
        if (!res.ok) throw new Error(String(res.status));
        const { events } = (await res.json()) as { events: RawEvent[] };
        if (cancelled || !stage) return;
        if (!events || events.length < 2) {
          setState('empty');
          return;
        }
        const start = events[0]!.timestamp;
        startRef.current = start;
        const metaEv = events.find((e) => e.type === RRWEB_TYPE.Meta)?.data as
          | { width?: number; height?: number }
          | undefined;
        const recW = metaEv?.width ?? 1280;
        const recH = metaEv?.height ?? 800;

        // Derive markers + evidence from Snag custom events.
        const mk: Marker[] = [];
        const ev: Ev[] = [];
        for (const e of events) {
          if (!isSnagEvent(e)) continue;
          const off = e.timestamp - start;
          const p = e.data.payload;
          if (p.kind === 'console' || p.kind === 'error') {
            const text = `${p.kind === 'error' ? 'uncaught' : 'console.' + p.level} ${p.message}`.slice(0, 160);
            mk.push({ offset: off, kind: 'error', label: text });
            ev.push({ offset: off, kind: p.kind === 'error' ? 'error' : 'console', text, bad: true });
          } else if (p.kind === 'network') {
            const failed = (p.status ?? 0) >= 400 || !!p.error || !!p.timedOut;
            const text = `${p.method} ${new URL(p.url, 'http://x').pathname} → ${p.status ?? p.error ?? 'timeout'} (${p.durationMs}ms)`;
            if (failed) mk.push({ offset: off, kind: 'network', label: text });
            ev.push({ offset: off, kind: 'network', text, bad: failed });
          } else if (p.kind === 'navigation') {
            ev.push({ offset: off, kind: 'navigation', text: `navigate ${new URL(p.url, 'http://x').pathname}`, bad: false });
          } else if (p.kind === 'click') {
            ev.push({ offset: off, kind: 'click', text: `click ${p.selector}${p.text ? ` "${p.text}"` : ''}`.slice(0, 140), bad: false });
          } else if (p.kind === 'form') {
            ev.push({ offset: off, kind: 'form', text: `form ${p.action} ${p.formSelector}`, bad: p.action === 'invalid' });
          }
        }
        if (flagTsStart) mk.push({ offset: Math.max(flagTsStart - start, 0), kind: 'flag', label: 'flagged moment' });
        ev.sort((a, b) => a.offset - b.offset);
        setMarkers(mk);
        setEvidence(ev);

        const { Replayer } = await import('rrweb');
        if (cancelled || !stage) return;
        stage.innerHTML = '';
        const replayer = new Replayer(events as never, {
          root: stage,
          skipInactive: true,
          mouseTail: false,
          speed: 1,
        });
        replayerRef.current = replayer;
        const md = replayer.getMetaData();
        setTotalMs(md.totalTime);
        const startOffset = flagTsStart
          ? Math.min(Math.max(flagTsStart - md.startTime - preRollMs, 0), md.totalTime)
          : 0;
        replayer.pause(startOffset);
        setPosMs(startOffset);
        fit(stage, recW, recH);
        replayer.on('finish', () => setPlaying(false));
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const r = replayerRef.current as (ReplayerType & { destroy?: () => void }) | null;
      try {
        r?.pause();
        r?.destroy?.();
      } catch {
        /* teardown races */
      }
      replayerRef.current = null;
      if (stage) stage.innerHTML = '';
    };
  }, [sessionId, flagTsStart, preRollMs, fit]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const r = replayerRef.current;
      if (r) setPosMs(Math.min(r.getCurrentTime(), totalMs));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalMs]);

  const toggle = () => {
    const r = replayerRef.current;
    if (!r) return;
    if (playing) {
      r.pause();
      setPlaying(false);
    } else {
      r.play(posMs >= totalMs ? 0 : posMs);
      setPlaying(true);
    }
  };
  const seek = (ms: number) => {
    const r = replayerRef.current;
    if (!r) return;
    const clamped = Math.min(Math.max(ms, 0), totalMs);
    setPosMs(clamped);
    if (playing) r.play(clamped);
    else r.pause(clamped);
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    (replayerRef.current as unknown as { setConfig?: (c: { speed: number }) => void })?.setConfig?.({
      speed: s,
    });
  };
  const fullscreen = () => frameRef.current?.requestFullscreen?.();

  const currentEvIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < evidence.length; i++) if (evidence[i]!.offset <= posMs) idx = i;
    return idx;
  }, [evidence, posMs]);

  const player = (
    <div className="replay" ref={frameRef}>
      {state === 'loading' && <p className="muted" style={{ padding: 20 }}>Loading replay…</p>}
      {state === 'empty' && (
        <p className="muted" style={{ padding: 20 }}>
          This session’s raw recording is no longer available (pruned by retention).
        </p>
      )}
      {state === 'error' && (
        <p className="error-text" style={{ padding: 20 }}>
          Could not load the replay.
        </p>
      )}
      <div ref={stageRef} className="replay-stage" style={{ display: state === 'ready' ? 'block' : 'none' }} />
      {state === 'ready' && (
        <div className="replay-controls">
          <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="scrub">
            <input
              type="range"
              min={0}
              max={totalMs || 0}
              value={posMs}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
            />
            <div className="markers">
              {markers.map((m, i) => (
                <button
                  key={i}
                  className={`marker ${m.kind}`}
                  style={{ left: `${totalMs ? (m.offset / totalMs) * 100 : 0}%` }}
                  title={m.label}
                  onClick={() => seek(m.offset)}
                  aria-label={m.label}
                />
              ))}
            </div>
          </div>
          <div className="speeds mono">
            {SPEEDS.map((s) => (
              <button key={s} className={`mini ${s === speed ? 'on' : ''}`} onClick={() => changeSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <span className="mono replay-time">
            {fmt(posMs)} / {fmt(totalMs)}
          </span>
          <button className="mini" title="Fullscreen" onClick={fullscreen}>
            ⤢
          </button>
        </div>
      )}
    </div>
  );

  if (!withEvidence) return player;

  return (
    <div className="replay-with-evidence">
      {player}
      <div className="card evidence-card">
        <h2 style={{ marginTop: 0 }}>Timeline</h2>
        {evidence.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>No console or network signals.</p>
        ) : (
          <div className="evidence">
            {evidence.map((e, i) => {
              const rel = flagTsStart ? e.offset - (flagTsStart - startRef.current) : e.offset;
              const inFlag =
                flagTsStart && flagTsEnd &&
                e.offset + startRef.current >= flagTsStart &&
                e.offset + startRef.current <= flagTsEnd;
              return (
                <div
                  key={i}
                  className={`ev ${i === currentEvIdx ? 'now' : ''} ${inFlag ? 'flagline' : ''}`}
                  onClick={() => seek(e.offset)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="t">{fmtRel(rel)}</span>
                  <span className={e.bad ? 'err' : e.kind === 'navigation' ? 'nav' : ''}>{e.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(ms: number): string {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtRel(ms: number): string {
  const s = ms / 1000;
  return `${s >= 0 ? '+' : ''}${s.toFixed(1)}s`;
}
