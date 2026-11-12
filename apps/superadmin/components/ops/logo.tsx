/** SVG shapes from the design studio; gradients are reserved for this mark. */
export function OpsMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 320 320" aria-hidden="true" className="ops-mark">
      <defs>
        <linearGradient id={`ops-mark-${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ops-forma-400)" />
          <stop offset="0.45" stopColor="var(--ops-forma-500)" />
          <stop offset="1" stopColor="var(--ops-forma-700)" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="72" fill={`url(#ops-mark-${size})`} />
      <g transform="translate(59 65) scale(.2552)" fill="var(--ops-ink-50)">
        <polygon points="207,0 791,0 653,185 314,185 237,297 0,299" />
        <polygon points="237,297 717,297 592,455 387,455 187,742 72,538" />
      </g>
    </svg>
  );
}

export function OpsLogo({ sub = 'Operator', size = 36 }: { sub?: string; size?: number }) {
  return (
    <div className="ops-logo">
      <OpsMark size={size} />
      <div>
        <span className="ops-wordmark">
          <strong>Forma</strong>
          <span>Core</span>
        </span>
        <span className="ops-logo-sub">{sub}</span>
      </div>
    </div>
  );
}
