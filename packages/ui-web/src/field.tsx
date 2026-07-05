import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './icon';

// Form field primitives, formalising the input styling the redesigned admin
// forms (settings, trainer, location, product) each hand-rolled as a local
// `FIELD_CLASS` constant — now one shared control so every form reads the same.
//
// Astryx migration (T11.4): these controls stay native `<input>`/`<select>`/
// `<textarea>` elements on the Fit brand theme rather than rendering Astryx's
// `TextInput`/`Selector`/`CheckboxInput`. Those Astryx inputs are *controlled*
// (a required `value` prop and a `(value, event)` onChange), which cannot back
// react-hook-form's uncontrolled `register()` spread that every edit screen and
// the Form kit (`./form`) depend on. Keeping them native preserves that contract
// while the shell (`rounded-field`, brand focus ring, ink palette) already reads
// the T11.1 Fit tokens; the Form kit's actions render Astryx `<Button>`.

/** The shared control shell: height, radius, border, brand focus ring, dark skin. */
const CONTROL =
  'w-full rounded-field border bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition focus:ring-4 disabled:bg-ink-50 disabled:text-ink-500 dark:bg-white/[0.04] dark:text-white dark:disabled:bg-white/5';

/** Border + focus-ring colours for the resting vs. invalid states. */
const STATE = {
  normal: 'border-ink-200 focus:border-brand-500 focus:ring-brand-500/20 dark:border-white/10',
  invalid:
    'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25 dark:border-danger-500/70',
} as const;

/** Field label styling shared across the redesigned forms. */
export const LABEL_CLASS = 'text-sm font-medium text-ink-700 dark:text-ink-200';

/** A standalone field label. */
export function Label({
  className = '',
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`${LABEL_CLASS} ${className}`} {...rest}>
      {children}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Paints the error border + ring. */
  invalid?: boolean;
}

/** A single-line text input on the formacore control shell. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className = '', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`h-11 ${CONTROL} ${invalid ? STATE.invalid : STATE.normal} ${className}`}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** A multi-line text input on the same shell. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className = '', rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={`py-2.5 ${CONTROL} ${invalid ? STATE.invalid : STATE.normal} ${className}`}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * A native `<select>` styled to match {@link Input}: the browser chrome is
 * hidden (`appearance-none`) and a formacore chevron is overlaid, keeping full
 * native keyboard / accessibility behaviour.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className = '', children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`h-11 appearance-none pr-10 ${CONTROL} ${invalid ? STATE.invalid : STATE.normal} ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
        sw={2.2}
      />
    </div>
  );
});

/**
 * Wiring a {@link Field} hands its function child so the control can be linked
 * to the field's label and message for assistive tech: `id` for the label,
 * `describedById` for the error / hint (undefined when neither is shown), and
 * `invalid` mirroring whether an error is present.
 */
export interface FieldControlMeta {
  /** The control id — also the label's `htmlFor`. */
  id: string;
  /** id of the error / hint node, for the control's `aria-describedby`. */
  describedById?: string;
  /** Whether an error is currently shown. */
  invalid: boolean;
}

export interface FieldProps {
  /** Field label; omit for an unlabelled control. */
  label?: ReactNode;
  /** Muted helper text shown under the control when there is no error. */
  hint?: ReactNode;
  /** Error message; when set it replaces the hint and paints the danger tone. */
  error?: ReactNode;
  /**
   * The control — an {@link Input}, {@link Select}, {@link Textarea} or custom
   * node. May also be a render function that receives the generated control id
   * (and, as a second argument, the full {@link FieldControlMeta} so the control
   * can wire `aria-describedby` to the message).
   */
  children: ReactNode | ((id: string, meta: FieldControlMeta) => ReactNode);
  /** Extra classes on the wrapping `<div>`. */
  className?: string;
  /**
   * Associates the label with the control. Pass the same value as the control's
   * `id`; when omitted, a generated id is exposed to a single function child.
   */
  htmlFor?: string;
}

/**
 * A labelled field: label · control · (error | hint). Wraps any control so the
 * edit screens compose forms declaratively instead of repeating the label /
 * hint / error scaffolding. Pass a render function as `children` to receive a
 * generated id when you don't want to manage one yourself.
 *
 * The error / hint text is linked to the control with `aria-describedby` so a
 * screen reader announces the validation message alongside the field.
 */
export function Field({ label, hint, error, children, className = '', htmlFor }: FieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const messageId = `${controlId}-message`;
  const hasMessage = Boolean(error) || Boolean(hint);
  const describedById = hasMessage ? messageId : undefined;
  const control =
    typeof children === 'function'
      ? children(controlId, { id: controlId, describedById, invalid: Boolean(error) })
      : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label ? <Label htmlFor={controlId}>{label}</Label> : null}
      {control}
      {error ? (
        <p id={messageId} className="text-xs font-medium text-danger-600 dark:text-danger-400">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-ink-500 dark:text-ink-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
