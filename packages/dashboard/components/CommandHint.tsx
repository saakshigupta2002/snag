'use client';

/** A subtle "press ⌘K" affordance in the sidebar that also opens the palette. */
export function CommandHint() {
  const open = () => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true }),
    );
  };
  return (
    <button className="cmd-hint mono" onClick={open} aria-label="Open command palette">
      <span>search</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
