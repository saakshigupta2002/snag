'use client';

export default function ProjectError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <p>
        <strong>Couldn’t load this view.</strong>
      </p>
      <p>
        The analytics service may be unreachable or still warming up. This usually clears on a
        retry.
      </p>
      <button className="btn" onClick={reset} style={{ marginTop: 12 }}>
        Try again
      </button>
    </div>
  );
}
