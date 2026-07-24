/* The Snag wordmark — lowercase, with a quiet blinking console cursor. */
export function Wordmark({ style }: { style?: React.CSSProperties }) {
  return (
    <div className="logo" style={style}>
      snag<span className="wm-cursor">_</span>
    </div>
  );
}
