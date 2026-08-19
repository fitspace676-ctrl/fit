'use client';

import {
  useId,
  useState,
  type FormHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { Icon } from '@fit/ui-web';
import { focus, text } from './tokens';

/**
 * The portal's form controls — the sign-in screen's field, promoted.
 *
 * The artboards' field is a specific object rather than a themed default: a 52px
 * control on the RECESSED surface (`--fc-tile`, the same inset the stat tiles
 * use), under a 10px uppercase micro-label whose row can also carry an inline
 * action ("forgot?"), with any inset control floated over the field's trailing
 * edge. Astryx's input owns its own label slot and vertical rhythm, so reaching
 * that layout meant overriding most of what it provided — at which point the
 * override was the component. This is that component, now for the whole portal
 * rather than only for the four screens at the door.
 *
 * The label is bound by `id` rather than by wrapping the control, so an inset
 * button — the password reveal — cannot end up inside the label's click target
 * and fire when someone clicks the word "Password".
 */

const styles = stylex.create({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'block',
  },
  // A `<fieldset>` carries a default border and padding in every browser; both
  // are cleared so the group reads as the kit's own object rather than as a
  // 1990s form box.
  group: {
    display: 'block',
    minWidth: 0,
    margin: 0,
    borderWidth: 0,
    padding: 0,
  },
  legend: {
    display: 'block',
    marginBottom: '0.5rem',
    padding: 0,
  },
  /**
   * Visually hidden, still announced. The 1px-clipped-rect recipe rather than
   * `display:none` or `visibility:hidden`, both of which take the element out of
   * the accessibility tree along with the pixels.
   */
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  // The label row is also an action row: the artboards hang "forgot?" off its
  // end rather than under the control, so the two never compete for the reader's
  // next glance.
  labelRow: {
    marginBottom: '0.5rem',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  inputWrap: {
    position: 'relative',
    display: 'block',
  },
  // The shared control skin. A field sits a step BELOW the panel it is on —
  // ink-950 inside ink-900 in dark, ink-50 inside white in light — which is the
  // same recessed trick the tiles use, and what makes a form read as part of the
  // same system as the dashboard around it.
  base: {
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':focus': 'var(--color-accent)' },
    backgroundColor: 'var(--fc-tile)',
    color: 'var(--color-text-primary)',
    paddingInline: '1rem',
    fontFamily: 'inherit',
    fontSize: '0.9375rem',
    fontWeight: 500,
    outline: 'none',
    // `:focus`, not `:focus-visible` — a text field earns its ring from a mouse
    // click too, because the caret alone is a weak signal of where typing lands.
    boxShadow: { default: null, ':focus': 'var(--fc-focus-ring)' },
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '150ms',
    '::placeholder': { color: 'var(--color-text-disabled)' },
  },
  input: {
    height: '3.25rem',
  },
  /**
   * The chrome height. A field inside a FORM is 52px — it is the thing the
   * screen is for. The same control inside CHROME (a top bar, a filter strip) is
   * one of several small objects in a row, and at 52px it fills the bar and
   * outweighs everything beside it. 40px is the kit's `card` step, so it lines
   * up with the buttons it sits next to.
   */
  chrome: {
    height: '2.5rem',
    fontSize: '0.875rem',
  },
  textarea: {
    display: 'block',
    minHeight: '6.5rem',
    paddingBlock: '0.875rem',
    lineHeight: 1.5,
    resize: 'vertical',
  },
  // The native select keeps its own arrow on some platforms and none on others,
  // so the appearance is reset and one chevron is drawn in the trailing slot.
  select: {
    height: '3.25rem',
    appearance: 'none',
    paddingInlineEnd: '2.75rem',
    cursor: 'pointer',
  },
  invalid: {
    borderColor: 'var(--color-error)',
  },
  disabled: {
    color: 'var(--color-text-disabled)',
    cursor: 'not-allowed',
  },
  withTrailing: {
    paddingInlineEnd: '3.5rem',
  },
  // Rule-of-the-field copy ("at least 8 characters"). `block` because it renders
  // inside the field wrapper, and an inline box would swallow the top margin
  // separating it from the control.
  hint: {
    display: 'block',
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  hintError: {
    color: 'var(--color-text-red)',
  },
  // An inset control over the field's trailing edge — the password reveal.
  trailing: {
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
  // Decoration, not a control — the select's chevron. `pointer-events: none` so
  // a click on it still opens the menu underneath.
  chevron: {
    position: 'absolute',
    insetInlineEnd: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    color: 'var(--color-text-secondary)',
  },
  /** A glyph inside the control's leading edge — a `pin` on a location picker. */
  startIcon: {
    position: 'absolute',
    insetInlineStart: '0.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'grid',
    placeItems: 'center',
    pointerEvents: 'none',
    color: 'var(--color-text-secondary)',
  },
  withStartIcon: {
    paddingInlineStart: '2.5rem',
  },
  glyph: {
    height: '1.125rem',
    width: '1.125rem',
  },
});

/**
 * The control skin, for kit-internal controls that are NOT an `<input>`.
 *
 * `DateField`'s trigger is a `<button>` that has to be indistinguishable from a
 * text field — same 52px height, same recessed fill, same focus ring. Handing it
 * these styles is what keeps the two from drifting the next time the field skin
 * is retuned. Not re-exported from the package index: this is an internal seam,
 * not a public one.
 */
export const fieldSkin = {
  base: styles.base,
  input: styles.input,
  invalid: styles.invalid,
  disabled: styles.disabled,
  trailing: styles.trailing,
  withTrailing: styles.withTrailing,
  glyph: styles.glyph,
} as const;

export interface FormProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'className' | 'style'
> {
  children: ReactNode;
  xstyle?: StyleXStyles;
}

/** A column of fields at the portal's form rhythm. */
export function Form({ children, xstyle, ...rest }: FormProps) {
  return (
    <form {...rest} {...stylex.props(styles.form, xstyle)}>
      {children}
    </form>
  );
}

export interface FieldShellProps {
  id: string;
  label: string;
  /**
   * Keep the label as the control's accessible name but do not draw it. For
   * chrome — a location switcher in a top bar, a search box — where the control
   * is self-evident in place and a 10px caption above it would be noise.
   *
   * It is `visually-hidden`, NOT removed: dropping the `<label>` and leaning on
   * a placeholder would leave the control unnamed for a screen reader, and the
   * placeholder disappears the moment a value is chosen.
   */
  labelHidden?: boolean;
  /** Hung off the end of the label row (e.g. a "forgot password?" link). */
  action?: ReactNode;
  /** Rule-of-the-field copy under the control. Turns red when `invalid`. */
  hint?: string;
  invalid?: boolean;
  children: ReactNode;
  xstyle?: StyleXStyles;
}

/** The label / control / hint scaffolding every control in this file shares. */
export function FieldShell({
  id,
  label,
  labelHidden = false,
  action,
  hint,
  invalid,
  children,
  xstyle,
}: FieldShellProps) {
  return (
    <div {...stylex.props(styles.field, xstyle)}>
      <span {...stylex.props(labelHidden ? styles.srOnly : styles.labelRow)}>
        <label htmlFor={id} {...stylex.props(!labelHidden && text.micro)}>
          {label}
        </label>
        {labelHidden ? null : action}
      </span>
      <span {...stylex.props(styles.inputWrap)}>{children}</span>
      {hint ? (
        <span id={`${id}-hint`} {...stylex.props(styles.hint, invalid && styles.hintError)}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Where the control lives, which decides its height. `field` (52px) is a form
 * control; `chrome` (40px) is one sitting in a bar beside buttons.
 */
export type FieldSize = 'field' | 'chrome';

export interface FieldGroupProps {
  /** The micro-label over the group. */
  label: string;
  /** Rule-of-the-field copy under it. */
  hint?: string;
  /** An error message; replaces `hint` and turns the copy red. */
  error?: string;
  children: ReactNode;
  xstyle?: StyleXStyles;
}

/**
 * A labelled wrapper around controls the kit does not own — a weekday picker, a
 * row of toggles, a colour swatch grid.
 *
 * It exists because `Field` IS an input: it renders the control itself, so it
 * cannot wrap one. The console had been using the old `@fit/ui-web` `Field` for
 * both jobs, which is why half its labels were bound to a control by `htmlFor`
 * and half were floating over a `<div>` bound to nothing.
 *
 * This one is honest about that: it renders a `<fieldset>`/`<legend>` pair, so
 * the label names the GROUP rather than pretending to name a single control. A
 * screen reader announces it once when focus enters, which is the right
 * behaviour for "On these days" over seven buttons.
 */
export function FieldGroup({ label, hint, error, children, xstyle }: FieldGroupProps) {
  const id = useId();
  const message = error ?? hint;
  return (
    <fieldset
      aria-describedby={message ? `${id}-msg` : undefined}
      {...stylex.props(styles.group, xstyle)}
    >
      <legend {...stylex.props(text.micro, styles.legend)}>{label}</legend>
      {children}
      {message ? (
        <span id={`${id}-msg`} {...stylex.props(styles.hint, Boolean(error) && styles.hintError)}>
          {message}
        </span>
      ) : null}
    </fieldset>
  );
}

export interface FieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'id' | 'size'
> {
  label: string;
  /** Keep the label as the accessible name without drawing it. */
  labelHidden?: boolean;
  /** @default 'field' */
  size?: FieldSize;
  action?: ReactNode;
  hint?: string;
  /** Draws the error border. Kept separate from `aria-invalid`, which it also sets. */
  invalid?: boolean;
  /**
   * Accessible names for the show/hide toggle. Passing them turns a
   * `type="password"` field into a revealable one; the strings come from the
   * caller so they stay in the app's i18n catalogue.
   */
  revealLabels?: { show: string; hide: string };
  xstyle?: StyleXStyles;
}

/** One labelled text control. */
export function Field({
  label,
  labelHidden = false,
  size = 'field',
  action,
  hint,
  invalid = false,
  revealLabels,
  type = 'text',
  xstyle,
  ...inputProps
}: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const revealable = Boolean(revealLabels) && type === 'password';

  return (
    <FieldShell
      id={id}
      label={label}
      labelHidden={labelHidden}
      action={action}
      hint={hint}
      invalid={invalid}
      xstyle={xstyle}
    >
      <input
        id={id}
        type={revealable && revealed ? 'text' : type}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...inputProps}
        {...stylex.props(
          styles.base,
          styles.input,
          size === 'chrome' && styles.chrome,
          revealable && styles.withTrailing,
          invalid && styles.invalid,
          inputProps.disabled && styles.disabled,
        )}
      />
      {revealable && revealLabels ? (
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? revealLabels.hide : revealLabels.show}
          disabled={inputProps.disabled}
          {...stylex.props(styles.trailing, focus.ring)}
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} sw={1.9} {...stylex.props(styles.glyph)} />
        </button>
      ) : null}
    </FieldShell>
  );
}

export interface TextareaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'style' | 'id'
> {
  label: string;
  /** Keep the label as the accessible name without drawing it. */
  labelHidden?: boolean;
  hint?: string;
  invalid?: boolean;
  xstyle?: StyleXStyles;
}

/** A multi-line control on the same skin. */
export function TextareaField({
  label,
  labelHidden = false,
  hint,
  invalid = false,
  xstyle,
  ...props
}: TextareaFieldProps) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      invalid={invalid}
      xstyle={xstyle}
    >
      <textarea
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
        {...stylex.props(
          styles.base,
          styles.textarea,
          invalid && styles.invalid,
          props.disabled && styles.disabled,
        )}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  /** Render as unselectable — a "choose one" placeholder row. */
  disabled?: boolean;
}

/**
 * A titled run of options, for a list long enough that a flat one stops being
 * scannable — automation triggers by category, plans by kind.
 *
 * The native `<optgroup>` rather than a custom listbox: the platform already
 * renders the heading, keeps it unselectable, and announces it as a group. A
 * hand-built equivalent would have to reimplement all three and would lose the
 * OS picker on a phone.
 */
export interface SelectOptionGroup {
  label: string;
  options: readonly SelectOption[];
}

function isGroup(item: SelectOption | SelectOptionGroup): item is SelectOptionGroup {
  return 'options' in item;
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'style' | 'id' | 'children' | 'size'
> {
  label: string;
  /** Keep the label as the accessible name without drawing it. */
  labelHidden?: boolean;
  /** @default 'field' */
  size?: FieldSize;
  options: readonly (SelectOption | SelectOptionGroup)[];
  /** Rendered inside the control, before the value — a `pin` on a location picker. */
  startIcon?: ReactNode;
  hint?: string;
  invalid?: boolean;
  /** Shown as a disabled first entry when the value is empty. */
  placeholder?: string;
  xstyle?: StyleXStyles;
}

/**
 * A native `<select>` on the field skin.
 *
 * Native on purpose: a custom listbox has to reimplement type-ahead, scroll
 * containment and the platform's own picker on a phone, and the portal's two
 * selects (the checkout's pickup location, the profile's preference) pick from a
 * short flat list — the case the native control is already good at. The kit's
 * `SegmentedControl` covers the case where the options must all stay visible.
 */
export function SelectField({
  label,
  labelHidden = false,
  size = 'field',
  options,
  startIcon,
  hint,
  invalid = false,
  placeholder,
  xstyle,
  ...props
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell
      id={id}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      invalid={invalid}
      xstyle={xstyle}
    >
      <select
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
        {...stylex.props(
          styles.base,
          styles.select,
          size === 'chrome' && styles.chrome,
          Boolean(startIcon) && styles.withStartIcon,
          invalid && styles.invalid,
          props.disabled && styles.disabled,
        )}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((item) =>
          isGroup(item) ? (
            <optgroup key={item.label} label={item.label}>
              {item.options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={item.value} value={item.value} disabled={item.disabled}>
              {item.label}
            </option>
          ),
        )}
      </select>
      {/* Both slots are decoration: `pointer-events: none` so a click anywhere
          over them still reaches the select underneath and opens it. */}
      {startIcon ? (
        <span aria-hidden {...stylex.props(styles.startIcon)}>
          {startIcon}
        </span>
      ) : null}
      <span aria-hidden {...stylex.props(styles.chevron)}>
        <Icon name="chevronDown" sw={2} {...stylex.props(styles.glyph)} />
      </span>
    </FieldShell>
  );
}
