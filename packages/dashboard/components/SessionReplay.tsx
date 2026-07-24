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

interface Spot {
  offset: number;
  x: number;
  y: number;
}

export interface ReportContext {
  title: string;
  finding: string;
  pagePath: string;
  /** Deep link to the flagged moment, e.g. /p/x/sessions/y?ts=… */
  sessionHref: string;
}

export function SessionReplay({
  sessionId,
  flagTsStart,
  flagTsEnd,
  preRollMs = 5000,
  postRollMs = 3500,
  withEvidence = false,
  publicId,
  report,
}: {
  sessionId: string;
  flagTsStart?: number;
  flagTsEnd?: number;
  preRollMs?: number;
  postRollMs?: number;
  withEvidence?: boolean;
  /** When set, fetch events via the public demo endpoint (read-only share). */
  publicId?: string;
  /** Enables the "steps to reproduce" list + "copy bug report" action. */
  report?: ReportContext;
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
  const [spots, setSpots] = useState<Spot[]>([]);
  const [view, setView] = useState({ scale: 1, offsetX: 0 });
  // "clip" plays just the flagged window; toggling off plays the full session.
  const [clip, setClip] = useState(true);
  const [copied, setCopied] = useState(false);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const wrap = stage?.querySelector<HTMLElement>('.replayer-wrapper');
    if (!stage || !wrap) return;
    const [w, h] = dimsRef.current;
    const availW = stage.clientWidth || 900;
    // Bound the height so tall (portrait / mobile) recordings don't turn the
    // player into an endless scroll, and fit to *both* axes so we never
    // overflow. The recording is then centred with a letterbox rather than
    // left-aligned in a sea of white.
    const maxH = Math.max(320, Math.min(Math.round(window.innerHeight * 0.62), 760));
    const scale = Math.min(availW / w, maxH / h, 1);
    const dispW = Math.round(w * scale);
    const dispH = Math.round(h * scale);
    const offsetX = Math.max(0, Math.round((availW - dispW) / 2));
    wrap.style.transform = `translateX(${offsetX}px) scale(${scale})`;
    wrap.style.transformOrigin = 'top left';
    stage.style.height = `${dispH}px`;
    // Publish the transform so the in-frame spotlight can track the element.
    setView((v) => (v.scale === scale && v.offsetX === offsetX ? v : { scale, offsetX }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;
    (async () => {
      try {
        const eventsUrl = publicId
          ? `/api/demo/${encodeURIComponent(publicId)}/sessions/${encodeURIComponent(sessionId)}/events`
          : `/api/sessions/${encodeURIComponent(sessionId)}/events`;
        const res = await fetch(eventsUrl);
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
        const sp: Spot[] = [];
        // Clicks landing inside the flagged window are what the spotlight
        // points at (± a little slack for single-instant flags).
        const spotFrom = flagTsStart ? flagTsStart - 800 : Infinity;
        const spotTo = (flagTsEnd ?? flagTsStart ?? 0) + 800;
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
            if (e.timestamp >= spotFrom && e.timestamp <= spotTo && typeof p.x === 'number' && typeof p.y === 'number') {
              sp.push({ offset: off, x: p.x, y: p.y });
            }
          } else if (p.kind === 'form') {
            ev.push({ offset: off, kind: 'form', text: `form ${p.action} ${p.formSelector}`, bad: p.action === 'invalid' });
          }
        }
        if (flagTsStart) mk.push({ offset: Math.max(flagTsStart - start, 0), kind: 'flag', label: 'flagged moment' });
        ev.sort((a, b) => a.offset - b.offset);
        setMarkers(mk);
        setEvidence(ev);
        setSpots(sp);

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
        // When we're here for a specific flagged moment, roll the clip straight
        // away — the point is to see the problem, not to press play and hunt.
        if (flagTsStart && hasVisual) {
          replayer.play(startOffset);
          setPlaying(true);
        }
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
  }, [sessionId, flagTsStart, preRollMs, fit, publicId]);

  // Re-fit on container/window resize.
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  // The flagged clip: a few seconds of lead-in through the end of the flagged
  // window plus a short tail, clamped to the recording.
  const clipBounds = useMemo(() => {
    if (!flagTsStart || !totalMs || !startRef.current) return null;
    const s = Math.min(Math.max(flagTsStart - startRef.current - preRollMs, 0), totalMs);
    const e = Math.min((flagTsEnd ?? flagTsStart) - startRef.current + postRollMs, totalMs);
    return { start: s, end: Math.max(e, s + 1500) };
  }, [flagTsStart, flagTsEnd, totalMs, preRollMs, postRollMs, state]);

  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const r = replayerRef.current;
      if (r) {
        const t = Math.min(r.getCurrentTime(), totalMs);
        // In clip mode, stop at the end of the flagged window instead of
        // playing on through the rest of the session.
        if (clip && clipBounds && t >= clipBounds.end) {
          r.pause(clipBounds.end);
          setPosMs(clipBounds.end);
          setPlaying(false);
          return;
        }
        setPosMs(t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, totalMs, clip, clipBounds]);

  const toggle = () => {
    const r = replayerRef.current;
    if (!r) return;
    if (playing) {
      r.pause();
      setPlaying(false);
    } else {
      let from = posMs >= totalMs ? 0 : posMs;
      // Replaying after the clip auto-stopped (or before it starts) restarts
      // the clip rather than doing nothing / drifting past it.
      if (clip && clipBounds && (posMs >= clipBounds.end || posMs < clipBounds.start)) {
        from = clipBounds.start;
      }
      setPosMs(from);
      r.play(from);
      setPlaying(true);
    }
  };
  const seek = (ms: number) => {
    const r = replayerRef.current;
    if (!r) return;
    const clamped = Math.min(Math.max(ms, 0), totalMs);
    // Navigating outside the flagged clip means the user wants the wider
    // session — drop clip mode so playback doesn't snap back to the clip.
    if (clip && clipBounds && (clamped < clipBounds.start - 50 || clamped > clipBounds.end + 50)) {
      setClip(false);
    }
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

  // The click the detector reacted to — shown as a spotlight ring in the frame
  // while the playhead is near it, so "the problem is here" is literal.
  const activeSpot = useMemo(() => {
    for (const s of spots) if (posMs >= s.offset - 400 && posMs <= s.offset + 2600) return s;
    return null;
  }, [spots, posMs]);

  // Where the detector flagged the problem, as a % band on the scrubber so the
  // moment that matters is impossible to miss (and one click away).
  const flag = useMemo(() => {
    if (!flagTsStart || !totalMs || !startRef.current) return null;
    const startOff = Math.max(flagTsStart - startRef.current, 0);
    const endOff = Math.min(Math.max((flagTsEnd ?? flagTsStart) - startRef.current, startOff), totalMs);
    return {
      startOff,
      left: (startOff / totalMs) * 100,
      width: Math.max(((endOff - startOff) / totalMs) * 100, 0.8),
    };
  }, [flagTsStart, flagTsEnd, totalMs, state]);

  // The handful of user actions right before the flag — a reproduction recipe
  // assembled from the event trail, each seekable.
  const steps = useMemo(() => {
    if (!report || !flag) return [];
    return evidence
      .filter(
        (e) =>
          e.offset < flag.startOff &&
          (e.kind === 'navigation' || e.kind === 'click' || e.kind === 'form'),
      )
      .slice(-5);
  }, [evidence, flag, report]);

  const copyReport = async () => {
    if (!report) return;
    const [w, h] = dimsRef.current;
    const device = w <= 640 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop';
    const lines = [`### ${report.title}`, '', `**What we found:** ${report.finding}`, ''];
    if (steps.length) {
      lines.push('**Steps to reproduce:**');
      steps.forEach((s, i) => lines.push(`${i + 1}. ${humanStep(s)}`));
      lines.push(`${steps.length + 1}. ⚠ ${report.title}`, '');
    }
    const href = report.sessionHref.startsWith('http')
      ? report.sessionHref
      : `${window.location.origin}${report.sessionHref}`;
    lines.push(
      `**Page:** \`${report.pagePath}\``,
      `**Viewport:** ${w}×${h} (${device})`,
      `**Replay:** ${href}`,
      '',
      '_Reported via snag_',
    );
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context) */
    }
  };

  const player = (
    <div className="replay" ref={frameRef}>
      {state === 'loading' && <div className="replay-msg muted">Loading replay…</div>}
      {state === 'empty' && (
        <div className="replay-msg muted">This session’s recording was pruned by retention.</div>
      )}
      {state === 'error' && <div className="replay-msg error-text">Could not load the replay.</div>}
      <div className="replay-stage-wrap">
        <div ref={stageRef} className="replay-stage" style={{ display: showControls ? 'block' : 'none' }} />
        {showControls && activeSpot && (
          <div
            className="replay-spot"
            style={{
              left: `${view.offsetX + activeSpot.x * view.scale}px`,
              top: `${activeSpot.y * view.scale}px`,
            }}
          />
        )}
        {state === 'ready' && (
          <div className={`replay-overlay ${playing ? '' : 'paused'}`} onClick={toggle}>
            <div className="replay-center" onClick={(e) => e.stopPropagation()}>
              <button className="replay-cbtn" onClick={() => skip(-10000)} aria-label="Back 10 seconds" title="Back 10s (←)">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 6a7 7 0 1 1-6.3 4" /><path d="M4 4v4h4" /><text x="12.5" y="15.5" fontSize="7" fill="currentColor" stroke="none" textAnchor="middle">10</text></svg>
              </button>
              <button className="replay-cbtn big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? (
                  <svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="5" width="4.5" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="4.5" height="14" rx="1" fill="currentColor" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="26" height="26" style={{ marginLeft: 3 }}><path d="M7 5l12 7-12 7V5Z" fill="currentColor" /></svg>
                )}
              </button>
              <button className="replay-cbtn" onClick={() => skip(10000)} aria-label="Forward 10 seconds" title="Forward 10s (→)">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 6a7 7 0 1 0 6.3 4" /><path d="M20 4v4h-4" /><text x="11.5" y="15.5" fontSize="7" fill="currentColor" stroke="none" textAnchor="middle">10</text></svg>
              </button>
            </div>
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
            {flag && (
              <div
                className="rc-flagband"
                style={{ left: `${flag.left}%`, width: `${flag.width}%` }}
                title="Flagged moment"
              />
            )}
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
            <span className="rc-time mono">
              {fmt(posMs)} <span className="rc-time-total">/ {fmt(totalMs)}</span>
            </span>
            {flag && (
              <>
                <button
                  className="rc-flagjump mono"
                  onClick={() => seek(flag.startOff)}
                  title="Jump to the flagged moment"
                >
                  ◆ flagged moment
                </button>
                <button
                  className={`rc-cliptoggle mono ${clip ? 'on' : ''}`}
                  onClick={() => {
                    const next = !clip;
                    setClip(next);
                    if (next && clipBounds) seek(clipBounds.start);
                  }}
                  title={
                    clip
                      ? 'Playing just the flagged clip — switch to the full session'
                      : 'Playing the full session — switch back to the flagged clip'
                  }
                >
                  {clip ? 'clip' : 'full'}
                </button>
              </>
            )}
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
      <div className="evidence-col">
        {report && (
          <button className={`copy-report ${copied ? 'done' : ''}`} onClick={copyReport}>
            {copied ? '✓ Copied — paste into GitHub / Linear / Slack' : '⧉ Copy bug report'}
          </button>
        )}

        {report && steps.length > 0 && (
          <div className="card steps-card">
            <h2 style={{ marginTop: 0 }}>Steps to reproduce</h2>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={i} onClick={() => seek(s.offset)} role="button" tabIndex={0}>
                  {humanStep(s)}
                </li>
              ))}
              <li className="flag-step">⚠ {report.title}</li>
            </ol>
          </div>
        )}

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
    </div>
  );
}

function humanStep(e: Ev): string {
  if (e.kind === 'navigation') return e.text.replace(/^navigate /, 'Went to ');
  if (e.kind === 'click') return e.text.replace(/^click /, 'Clicked ');
  if (e.kind === 'form') return e.text.replace(/^form /, 'Form ');
  return e.text;
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
