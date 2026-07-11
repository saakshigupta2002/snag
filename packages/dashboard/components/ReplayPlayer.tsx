'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Replayer as ReplayerType } from 'rrweb';
import 'rrweb/dist/style.css';

/**
 * Session replay built directly on rrweb's core Replayer with a small custom
 * controller. (The rrweb-player wrapper package is not used — in 2.1.0 it
 * mounts its shell but never builds the replay iframe.) The player is a
 * viewer of a re-performance: it looks live but is not an interactive copy
 * of the app. Auto-seeks to a few seconds before the flagged moment.
 */
export function ReplayPlayer({
  sessionId,
  seekToTs,
  preRollMs = 5000,
}: {
  sessionId: string;
  seekToTs?: number;
  preRollMs?: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<ReplayerType | null>(null);
  const rafRef = useRef<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);
  const [totalMs, setTotalMs] = useState(0);
  const [posMs, setPosMs] = useState(0);

  // Scale the recorded viewport down to fit the container width.
  const fit = useCallback((stage: HTMLDivElement, recordedW: number, recordedH: number) => {
    const wrapper = stage.querySelector<HTMLElement>('.replayer-wrapper');
    if (!wrapper || !recordedW) return;
    const containerW = stage.clientWidth || 900;
    const scale = Math.min(containerW / recordedW, 1);
    wrapper.style.transform = `scale(${scale})`;
    wrapper.style.transformOrigin = 'top left';
    stage.style.height = `${Math.round(recordedH * scale)}px`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;

    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
        if (!res.ok) throw new Error(String(res.status));
        const { events } = (await res.json()) as {
          events: Array<{ type: number; data: { width?: number; height?: number }; timestamp: number }>;
        };
        if (cancelled || !stage) return;
        if (!events || events.length < 2) {
          setState('empty');
          return;
        }

        const meta = events.find((e) => e.type === 4)?.data ?? {};
        const recordedW = meta.width ?? 1280;
        const recordedH = meta.height ?? 800;

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
        const startOffset = seekToTs
          ? Math.min(Math.max(seekToTs - md.startTime - preRollMs, 0), md.totalTime)
          : 0;
        replayer.pause(startOffset); // render the initial frame
        setPosMs(startOffset);
        fit(stage, recordedW, recordedH);
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
        // best effort
      }
      replayerRef.current = null;
      if (stage) stage.innerHTML = '';
    };
  }, [sessionId, seekToTs, preRollMs, fit]);

  // While playing, follow the replayer clock to drive the scrubber.
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
    setPosMs(ms);
    if (playing) r.play(ms);
    else r.pause(ms);
  };

  return (
    <div className="replay">
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
      <div
        ref={stageRef}
        className="replay-stage"
        style={{ display: state === 'ready' ? 'block' : 'none' }}
      />
      {state === 'ready' && (
        <div className="replay-controls">
          <button onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={totalMs || 0}
            value={posMs}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
          />
          <span className="mono replay-time">
            {fmt(posMs)} / {fmt(totalMs)}
          </span>
        </div>
      )}
    </div>
  );
}

function fmt(ms: number): string {
  const s = Math.max(Math.floor(ms / 1000), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
