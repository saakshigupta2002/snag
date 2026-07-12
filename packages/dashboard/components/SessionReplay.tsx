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

const SPEEDS = [0.5, 1, 2, 4, 8];

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
  const dimsRef = useRef<[number, number]>([1280, 800]);
  const eventsRef = useRef<RawEvent[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error' | 'blank'>('loading');
  const [playing, setPlaying] = useState(false);
  const [totalMs, setTotalMs] = useState(0);
  const [posMs, setPosMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [evidence, setEvidence] = useState<Ev[]>([]);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const wrap = stage?.querySelector<HTMLElement>('.replayer-wrapper');
    if (!stage || !wrap) return;
    const [w, h] = dimsRef.current;
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
        eventsRef.current = events;
        const start = events[0]!.timestamp;
        startRef.current = start;
        const metaEv = events.find((e) => e.type === RRWEB_TYPE.Meta)?.data as
          | { width?: number; height?: number }
          | undefined;
        dimsRef.current = [metaEv?.width ?? 1280, metaEv?.height ?? 800];

        // A recording is "blank" only if it has no full DOM snapshot to draw.
        // Determine this from the events (deterministic) rather than probing
        // the iframe, which isn't populated synchronously after pause().
        const hasVisual = events.some(
          (e) =>
            e.type === RRWEB_TYPE.FullSnapshot &&
            !!((e.data as { node?: { childNodes?: unknown[] } } | undefined)?.node?.childNodes
              ?.length),
        );

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
            const text = `${p.method} ${safePath(p.url)} → ${p.status ?? p.error ?? 'timeout'} (${p.durationMs}ms)`;
            if (failed) mk.push({ offset: off, kind: 'network', label: text });
            ev.push({ offset: off, kind: 'network', text, bad: failed });
          } else if (p.kind === 'navigation') {
            ev.push({ offset: off, kind: 'navigation', text: `navigate ${safePath(p.url)}`, bad: false });
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
        fit();
        replayer.on('finish', () => setPlaying(false));
        setState(hasVisual ? 'ready' : 'blank');
        requestAnimationFrame(fit);
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

  // Re-fit on container/window resize.
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

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
  const skip = (delta: number) => {
    const r = replayerRef.current;
    if (!r) return;
    seek(r.getCurrentTime() + delta);
  };
  const download = () => {
    const events = eventsRef.current;
    if (!events.length) return;
    const blob = new Blob([JSON.stringify(events)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snag-session-${sessionId.split(':').pop()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    setSpeedOpen(false);
    (replayerRef.current as unknown as { setConfig?: (c: { speed: number }) => void })?.setConfig?.({ speed: s });
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else frameRef.current?.requestFullscreen?.();
  };

  // Keep latest actions in a ref so the keyboard listener never goes stale.
  const actionsRef = useRef({ toggle, skip, fullscreen });
  actionsRef.current = { toggle, skip, fullscreen };

  useEffect(() => {
    if (state !== 'ready' && state !== 'blank') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const a = actionsRef.current;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        a.toggle();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        a.skip(-10000);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        a.skip(10000);
      } else if (e.key === 'f') {
        a.fullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const currentEvIdx = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < evidence.length; i++) if (evidence[i]!.offset <= posMs) idx = i;
    return idx;
  }, [evidence, posMs]);

  const pct = totalMs ? (posMs / totalMs) * 100 : 0;
  const showControls = state === 'ready' || state === 'blank';

  const player = (
    <div className="replay" ref={frameRef}>
      {state === 'loading' && <div className="replay-msg muted">Loading replay…</div>}
      {state === 'empty' && (
        <div className="replay-msg muted">This session’s recording was pruned by retention.</div>
      )}
      {state === 'error' && <div className="replay-msg error-text">Could not load the replay.</div>}
      <div className="replay-stage-wrap">
        <div ref={stageRef} className="replay-stage" style={{ display: showControls ? 'block' : 'none' }} />
        {state === 'ready' && (
          <div className="replay-overlay" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
            {!playing && (
              <span className="replay-bigplay">
                <svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 5l12 7-12 7V5Z" fill="currentColor" /></svg>
              </span>
            )}
          </div>
        )}
        {state === 'blank' && (
          <div className="replay-blank">
            <span>No visual frames in this recording</span>
            <span className="muted">The events and timeline are still shown →</span>
          </div>
        )}
      </div>

      {showControls && (
        <div className="rc">
          <div className="rc-track" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - rect.left) / rect.width) * totalMs);
          }}>
            <div className="rc-buffered" />
            <div className="rc-played" style={{ width: `${pct}%` }} />
            <div className="rc-handle" style={{ left: `${pct}%` }} />
            <div className="rc-markers">
              {markers.map((m, i) => (
                <span
                  key={i}
                  className={`rc-marker ${m.kind}`}
                  style={{ left: `${totalMs ? (m.offset / totalMs) * 100 : 0}%` }}
                  title={m.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    seek(m.offset);
                  }}
                />
              ))}
            </div>
          </div>

          <div className="rc-bar">
            <button className="rc-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="17" height="17"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="17" height="17"><path d="M7 5l12 7-12 7V5Z" fill="currentColor" /></svg>
              )}
            </button>
            <button className="rc-btn" onClick={() => skip(-10000)} aria-label="Back 10 seconds" title="Back 10s (←)">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6a7 7 0 1 1-6.3 4" /><path d="M4 4v4h4" /><text x="12" y="15.5" fontSize="7" fill="currentColor" stroke="none" textAnchor="middle">10</text></svg>
            </button>
            <button className="rc-btn" onClick={() => skip(10000)} aria-label="Forward 10 seconds" title="Forward 10s (→)">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 6a7 7 0 1 0 6.3 4" /><path d="M20 4v4h-4" /><text x="12" y="15.5" fontSize="7" fill="currentColor" stroke="none" textAnchor="middle">10</text></svg>
            </button>
            <span className="rc-time mono">
              {fmt(posMs)} <span className="rc-time-total">/ {fmt(totalMs)}</span>
            </span>
            <div className="rc-spacer" />
            <div className="rc-speed">
              <button className="rc-btn rc-speed-btn mono" onClick={() => setSpeedOpen((o) => !o)}>
                {speed}×
              </button>
              {speedOpen && (
                <>
                  <div className="rc-menu-backdrop" onClick={() => setSpeedOpen(false)} />
                  <div className="rc-menu">
                    {SPEEDS.map((s) => (
                      <button key={s} className={`mono ${s === speed ? 'on' : ''}`} onClick={() => changeSpeed(s)}>
                        {s}×
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button className="rc-btn" onClick={download} aria-label="Download recording" title="Download recording (.json)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            </button>
            <button className="rc-btn" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (f)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
            </button>
          </div>
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

function safePath(url: string): string {
  try {
    return new URL(url, 'http://x').pathname;
  } catch {
    return url;
  }
}
function fmt(ms: number): string {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtRel(ms: number): string {
  const s = ms / 1000;
  return `${s >= 0 ? '+' : ''}${s.toFixed(1)}s`;
}
