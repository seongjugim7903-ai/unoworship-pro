'use client';

import { useEffect } from 'react';

const OUTPUT_RUNTIME_GUARD_STYLE_ID = 'unolive-output-runtime-guards';

const OUTPUT_RUNTIME_GUARD_CSS = `
  nextjs-portal,
  [data-nextjs-toast],
  [data-nextjs-dialog-overlay],
  [data-nextjs-dialog],
  [data-nextjs-terminal],
  [data-nextjs-errors],
  [data-nextjs-dev-tools-button],
  [data-nextjs-dev-tools-panel] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

export default function OutputRuntimeGuards() {
  useEffect(() => {
    let style = document.getElementById(OUTPUT_RUNTIME_GUARD_STYLE_ID) as HTMLStyleElement | null;

    if (!style) {
      style = document.createElement('style');
      style.id = OUTPUT_RUNTIME_GUARD_STYLE_ID;
      document.head.appendChild(style);
    }

    style.textContent = OUTPUT_RUNTIME_GUARD_CSS;

    return () => {
      style?.remove();
    };
  }, []);

  return null;
}
