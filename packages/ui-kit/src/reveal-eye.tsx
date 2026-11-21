import * as stylex from '@stylexjs/stylex';
import { focus } from './tokens';

/** Strong UI ease-out — the reveal is a state toggle, so it settles fast. */
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const styles = stylex.create({
  svg: {
    width: '1.125rem',
    height: '1.125rem',
    overflow: 'visible',
  },
  // `pathLength={1}` normalises the slash, so a 0→1 offset draws it end to end.
  slash: {
    strokeDasharray: 1,
    strokeDashoffset: 1,
    transitionProperty: 'stroke-dashoffset',
    transitionDuration: {
      default: '200ms',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: EASE_OUT,
  },
  slashOn: {
    strokeDashoffset: 0,
  },
  pupil: {
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transitionProperty: 'transform',
    transitionDuration: {
      default: '200ms',
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: EASE_OUT,
  },
  pupilShut: {
    transform: 'scale(0.6)',
  },
  // An inset control over a field's trailing edge. The press-in confirms the tap
  // and rides on the centring translate.
  button: {
    position: 'absolute',
    insetInlineEnd: '0.5rem',
    top: '50%',
    transform: {
      default: 'translateY(-50%)',
      ':active': 'translateY(-50%) scale(0.92)',
    },
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    width: '2.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    transitionProperty: 'background-color, color, transform',
    transitionDuration: '150ms',
    transitionTimingFunction: EASE_OUT,
  },
});

/**
 * The password-reveal glyph: an eye that draws a slash across itself while the
 * password is shown (the next press hides it) and wipes it away again, the pupil
 * narrowing with it. One SVG, animated with CSS transitions on the stroke offset
 * and the pupil's scale, so it stays interruptible mid-toggle and is instant
 * under `prefers-reduced-motion`.
 */
export function RevealEye({ revealed }: { revealed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...stylex.props(styles.svg)}
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" {...stylex.props(styles.pupil, revealed && styles.pupilShut)} />
      <path
        d="M3.5 3.5 20.5 20.5"
        pathLength={1}
        {...stylex.props(styles.slash, revealed && styles.slashOn)}
      />
    </svg>
  );
}

/**
 * The show/hide-password button, absolutely placed over a field's trailing edge
 * (the field's wrapper must be `position: relative`, and the input needs room on
 * its end — `Field` does both). Its label names the action the press performs.
 */
export function RevealButton({
  revealed,
  onToggle,
  labels,
  disabled,
}: {
  revealed: boolean;
  onToggle: () => void;
  labels: { show: string; hide: string };
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={revealed ? labels.hide : labels.show}
      aria-pressed={revealed}
      title={revealed ? labels.hide : labels.show}
      disabled={disabled}
      {...stylex.props(styles.button, focus.ring)}
    >
      <RevealEye revealed={revealed} />
    </button>
  );
}
