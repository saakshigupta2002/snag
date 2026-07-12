'use client';

import { useToast } from './Toast';

export function ShareButton() {
  const toast = useToast();
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast('Link copied — send it to a dev', 'ok');
        } catch {
          toast('Could not copy the link', 'error');
        }
      }}
    >
      Share ↗
    </button>
  );
}
