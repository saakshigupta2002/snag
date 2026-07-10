'use client';

import { useEffect, useRef, useState } from 'react';
import 'rrweb-player/dist/style.css';

/**
 * rrweb-player wrapper. Fetches the stored event stream and reconstructs the
 * session, auto-seeking to a few seconds before the flagged moment. The
 * player is a viewer of a re-performance — it looks live but is not an
 * interactive copy of the app.
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
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any;
    const mount = mountRef.current;

    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
        if (!res.ok) throw new Error(String(res.status));
        const { events } = (await res.json()) as { events: Array<{ timestamp: number }> };
        if (cancelled || !mount) return;
        if (!events || events.length < 2) {
          setState('empty');
          return;
        }
        const mod = await import('rrweb-player');
        if (cancelled || !mount) return;
        const Player = mod.default;
        const width = Math.min(mount.clientWidth || 860, 1100);
        player = new Player({
          target: mount,
          props: {
            // Stored events are rrweb's own serialized eventWithTime shape;
            // the API types them minimally, so cast at this one boundary.
            events: events as never,
            autoPlay: false,
            skipInactive: true,
            width,
            height: Math.round(width * 0.62),
            showController: true,
          },
        });
        if (seekToTs) {
          const start = events[0]!.timestamp;
          const offset = Math.max(seekToTs - start - preRollMs, 0);
          try {
            player.goto(offset, false);
          } catch {
            // seeking is best-effort
          }
        }
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      try {
        player?.pause?.();
        player?.$destroy?.();
      } catch {
        // ignore teardown races
      }
      if (mount) mount.innerHTML = '';
    };
  }, [sessionId, seekToTs, preRollMs]);

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
      <div ref={mountRef} />
    </div>
  );
}
