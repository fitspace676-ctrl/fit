'use client';

import { type InputHTMLAttributes, type ReactNode, useId, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Icon } from '@/src/components/ui';

/**
 * The auth screens' shared controls — one 52px field, one 56px lime submit, one
 * banner — rendered identically by sign-in, forgot-password and
 * set-a-new-password.
 *
 * WHY THESE ARE HAND-AUTHORED RATHER THAN ASTRYX `TextInput`. The artboard's
 * field is a specific object, not a themed default: a 52px control over a 10px
 * uppercase micro-label whose row can also carry an inline action ("forgot?"),
 * with the reveal button inset over the field's right edge. Astryx's input owns
 * its own label slot and vertical rhythm, so reaching that layout means
 * overriding most of what it provides — at which point the override is the
 * component. The rest of the product keeps the Astryx inputs; this vocabulary is
 * local to the door, which the direction treats as a set piece.
 *
 * WHY COMPONENTS RATHER THAN AN EXPORTED STYLES OBJECT. `stylex.create` results
 * do not survive being exported across module boundaries under this app's SWC
 * StyleX compiler — the importing file receives `undefined` at runtime. So the
 * styles stay inside this file and the sharing happens at the component level,
 * which is the sturdier seam anyway: a caller cannot half-apply the field.
 */

const spin = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  /* --------------------------------- fields -------------------------------- */
  field: {
    display: 'block',
  },
  // The label row is also an action row — the artboard hangs "forgot?" off the
  // end of it rather than under the field, so the two never compete for the
  // reader's next glance.
  labelRow: {
    marginBottom: '0.5rem',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  label: {
    fontSize: '0.625rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--color-text-secondary)',
  },
  inputWrap: {
    position: 'relative',
    display: 'block',
  },
  input: {
    height: '3.25rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    // The field sits a step BELOW the panel it is on — ink-950 inside ink-900 in
    // dark, white-on-ink-50 inverted in light. Same recessed trick as the tiles.
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-primary)',
    paddingInline: '1rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    outline: 'none',
    boxShadow: {
      default: null,
      ':focus': '0 0 0 3px color-mix(in srgb, var(--color-accent) 40%, transparent)',
    },
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    '::placeholder': { color: 'var(--color-text-disabled)' },
  },
  inputInvalid: {
    borderColor: 'var(--color-error)',
  },
  inputWithAction: {
    paddingInlineEnd: '3.5rem',
  },
  // Rule-of-the-field copy ("at least 8 characters"). `block` because it renders
  // as a `<span>` inside the field's `<label>`, and an inline box would swallow
  // the top margin that separates it from the control.
  hint: {
    display: 'block',
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  reveal: {
    position: 'absolute',
    insetInlineEnd: '0.5rem',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'grid',
    placeItems: 'center',
    height: '2.25rem',
    width: '2.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--fc-ghost)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  revealIcon: {
    height: '1.125rem',
    width: '1.125rem',
  },

  /* -------------------------------- banners -------------------------------- */
  banner: {
    margin: 0,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    borderRadius: 'var(--radius-inner)',
    padding: '1rem',
    fontSize: '0.8125rem',
    fontWeight: 500,
    lineHeight: 1.6,
  },
  bannerError: {
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-text-red)',
  },
  // "Sent" is the good news, so it gets the lime — the one colour the direction
  // lets a positive state use. A tint rather than a fill: a solid lime panel
  // here would outweigh the form it is reporting on.
  bannerSuccess: {
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 22%, transparent)',
    color: 'var(--color-text-primary)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 45%, transparent)',
  },
  bannerIcon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
  },
  bannerIconError: {
    color: 'var(--color-icon-red)',
  },
  bannerIconSuccess: {
    color: 'var(--color-text-accent)',
  },

  /* -------------------------------- submit --------------------------------- */
  // 56px and 16px bold — the tallest, heaviest control in the product. It is the
  // only thing on the screen the visitor has to press.
  submit: {
    marginTop: '0.75rem',
    display: 'flex',
    height: '3.5rem',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    backgroundColor: { default: 'var(--color-accent)', ':hover': '#EFF9A2' },
    color: 'var(--color-on-accent)',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  submitBusy: {
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--fc-on-quiet)',
    cursor: 'not-allowed',
  },
  spinner: {
    height: '1.25rem',
    width: '1.25rem',
    animationName: spin,
    animationDuration: '900ms',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
});

/** The submit button's spinner — an arc over a faint ring, rotating. */
function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      {...stylex.props(styles.spinner)}
    >
      <circle cx="12" cy="12" r="8.5" opacity={0.3} />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" />
    </svg>
  );
}

/** The `<form>` element itself — a column with the auth screens' field rhythm. */
export function AuthForm({
  onSubmit,
  children,
}: {
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} {...stylex.props(styles.form)}>
      {children}
    </form>
  );
}

export interface AuthFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'id'
> {
  /** The micro-label above the control. */
  label: string;
  /** Optional link hung off the end of the label row (e.g. "forgot password?"). */
  action?: ReactNode;
  /** Rule-of-the-field copy under the control. */
  hint?: string;
  /** Draws the error border. Kept separate from `aria-invalid`, which it also sets. */
  invalid?: boolean;
  /**
   * Accessible names for the show/hide toggle. Passing them turns a
   * `type="password"` field into a revealable one; the labels come from the
   * caller so the strings stay in the app's i18n catalogue.
   */
  revealLabels?: { show: string; hide: string };
}

/**
 * One labelled control. The label is bound to the input by id rather than by
 * wrapping it, so the reveal button — which sits inside the field — cannot end
 * up inside the label's click target and toggle visibility when someone clicks
 * the word "Password".
 */
export function AuthField({
  label,
  action,
  hint,
  invalid = false,
  revealLabels,
  type = 'text',
  ...inputProps
}: AuthFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [revealed, setRevealed] = useState(false);
  const revealable = Boolean(revealLabels) && type === 'password';

  return (
    <div {...stylex.props(styles.field)}>
      <span {...stylex.props(styles.labelRow)}>
        <label htmlFor={id} {...stylex.props(styles.label)}>
          {label}
        </label>
        {action}
      </span>

      <span {...stylex.props(styles.inputWrap)}>
        <input
          id={id}
          type={revealable && revealed ? 'text' : type}
          aria-invalid={invalid || undefined}
          aria-describedby={hint ? hintId : undefined}
          {...inputProps}
          {...stylex.props(
            styles.input,
            revealable && styles.inputWithAction,
            invalid && styles.inputInvalid,
          )}
        />
        {revealable && revealLabels ? (
          <button
            type="button"
            onClick={() => setRevealed((prev) => !prev)}
            aria-label={revealed ? revealLabels.hide : revealLabels.show}
            disabled={inputProps.disabled}
            {...stylex.props(styles.reveal)}
          >
            <Icon
              name={revealed ? 'eyeOff' : 'eye'}
              sw={1.9}
              {...stylex.props(styles.revealIcon)}
            />
          </button>
        ) : null}
      </span>

      {hint ? (
        <span id={hintId} {...stylex.props(styles.hint)}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** The one thing on the screen the visitor has to press. */
export function AuthSubmit({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      {...stylex.props(styles.submit, pending && styles.submitBusy)}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

/**
 * An inline message above — or instead of — the form. `error` is announced as an
 * alert because it interrupts what the visitor was doing; `success` is a status,
 * which screen readers queue rather than cut in with.
 */
export function AuthBanner({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const isError = tone === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      {...stylex.props(styles.banner, isError ? styles.bannerError : styles.bannerSuccess)}
    >
      <Icon
        name={isError ? 'info' : 'check'}
        sw={2.2}
        {...stylex.props(
          styles.bannerIcon,
          isError ? styles.bannerIconError : styles.bannerIconSuccess,
        )}
      />
      {children}
    </p>
  );
}
