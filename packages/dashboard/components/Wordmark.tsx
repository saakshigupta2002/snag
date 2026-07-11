/* The Snag wordmark: monospace, lowercase, with a blinking teal cursor —
   a quiet nod to the console. */
export function Wordmark({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="logo" style={style}>
      snag<span className="wm-cursor">_</span>
    </div>
  );
}
