// @fit/admin — the AI agent's mark.
//
// A flat tile in the FormaCore blue (brand-500, the console's one colour) with a
// single white four-point spark — cut with the same squared-off radius as the
// FormaCore app icon, so it reads as part of the product rather than a generic
// "AI orb". No gloss, no glow: the console is flat ink with one blue, and the mark
// follows it.
//
// The same artwork ships as a static file in `public/ai-mark.svg` for places that
// need a URL (emails, docs, the marketing site).

import type { CSSProperties } from 'react';

export function AiMark({
  size = 32,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      focusable="false"
      className={className}
      style={style}
    >
      <rect width="32" height="32" rx="9" fill="#1A7FD6" />
      <path
        d="M16 7.5c.62 4.62 2.88 6.88 7.5 7.5-4.62.62-6.88 2.88-7.5 7.5-.62-4.62-2.88-6.88-7.5-7.5 4.62-.62 6.88-2.88 7.5-7.5Z"
        fill="#FFFFFF"
      />
      <circle cx="23" cy="9" r="1.5" fill="#DCEEFF" />
    </svg>
  );
}
