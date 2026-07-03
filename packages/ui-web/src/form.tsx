'use client';

import type { FormHTMLAttributes, ReactNode } from 'react';
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type RegisterOptions,
  type Resolver,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodType, ZodTypeDef } from 'zod';
import { Btn, type BtnProps } from './button';
import {
  Field,
  Input,
  Select,
  Textarea,
  type InputProps,
  type SelectProps,
  type TextareaProps,
} from './field';

// The form kit (T1.7): react-hook-form + zod wired onto the styled field
// primitives from `./field`, plus the fieldset / grid / banner scaffolding the
// redesigned edit screens (settings, billing-plan-edit, product editor) each
// hand-rolled. A screen declares a zod schema, calls `useZodForm`, and drops
// `<TextField name="…">` controls inside `<FormSection>`s — validation, error
// styling, and submit state come for free and read identically everywhere.

/* -------------------------------------------------------------------------- */
/*  Pure helpers (unit-tested)                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the message for a (possibly nested) field from react-hook-form's
 * `errors` tree. Walks a dotted path — `variants.0.price` — and returns the
 * leaf `message` when it is a string, else `undefined`. Kept pure so the field
 * wrappers stay thin and the path logic is testable without a DOM.
 */
export function fieldErrorText(errors: FieldErrors, name: string): string | undefined {
  const node = name.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, errors);
  if (node && typeof node === 'object' && 'message' in node) {
    const message = (node as { message?: unknown }).message;
    return typeof message === 'string' && message.length > 0 ? message : undefined;
  }
  return undefined;
}

/** Section legend styling — the mono uppercase eyebrow above each fieldset. */
export const FORM_LEGEND_CLASS =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400';

/** Muted description text under a legend or banner. */
export const FORM_DESC_CLASS = 'text-xs text-ink-400';

/** Number of responsive columns a {@link FormGrid} can span. */
export type FormCols = 1 | 2 | 3;

/** Responsive grid classes: one column on mobile, `cols` from the `sm` breakpoint up. */
export function formGridClasses(cols: FormCols = 1, className = ''): string {
  const map: Record<FormCols, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  };
  return `grid gap-4 ${map[cols]} ${className}`.trim();
}

/** The tones a {@link FormBanner} can paint. */
export type BannerTone = 'danger' | 'success' | 'warning' | 'info';

/** Rounded-card banner classes per tone, matching the form status banners. */
export function formBannerClasses(tone: BannerTone, className = ''): string {
  const map: Record<BannerTone, string> = {
    danger: 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-300',
    success: 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300',
    warning: 'bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300',
    info: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  };
  return `rounded-card px-3 py-2 text-sm ${map[tone]} ${className}`.trim();
}

/* -------------------------------------------------------------------------- */
/*  Form instance + <Form>                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `useForm` pre-wired with a zod resolver. `TIn` is what the fields hold (the
 * schema *input*) and `TOut` is the parsed value handed to your submit handler
 * (the schema *output*), so coercions such as `z.coerce.number()` are reflected
 * in the callback's type. Validation runs `onTouched` by default; pass `mode`
 * (or any other `useForm` option except `resolver`) to override.
 */
export function useZodForm<
  TOut extends FieldValues,
  TDef extends ZodTypeDef,
  TIn extends FieldValues,
>(
  schema: ZodType<TOut, TDef, TIn>,
  options?: Omit<UseFormProps<TIn, unknown, TOut>, 'resolver'>,
): UseFormReturn<TIn, unknown, TOut> {
  return useForm<TIn, unknown, TOut>({
    mode: 'onTouched',
    ...options,
    resolver: zodResolver(schema) as Resolver<TIn, unknown, TOut>,
  });
}

export interface FormProps<TIn extends FieldValues, TOut extends FieldValues> extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'onSubmit'
> {
  /** The instance from {@link useZodForm} (or a bare `useForm`). */
  form: UseFormReturn<TIn, unknown, TOut>;
  /** Called with the validated, parsed values when the form submits cleanly. */
  onSubmit: SubmitHandler<TOut>;
  children: ReactNode;
}

/**
 * A `<form>` bound to a react-hook-form instance: it publishes the instance on
 * context (so the `*Field` controls below find it) and routes native submits
 * through `handleSubmit`, which validates before calling {@link FormProps.onSubmit}.
 */
export function Form<TIn extends FieldValues, TOut extends FieldValues>({
  form,
  onSubmit,
  children,
  className = '',
  ...rest
}: FormProps<TIn, TOut>) {
  return (
    <FormProvider {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        noValidate
        className={className}
        {...rest}
      >
        {children}
      </form>
    </FormProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Layout scaffolding                                                         */
/* -------------------------------------------------------------------------- */

export interface FormSectionProps {
  /** The mono eyebrow above the section — omit for an unlabelled group. */
  title?: ReactNode;
  /** Optional muted line under the title. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * A titled `<fieldset>` grouping related fields, mirroring the redesigned forms'
 * `legend` + description + stacked-controls rhythm.
 */
export function FormSection({ title, description, children, className = '' }: FormSectionProps) {
  return (
    <fieldset className={`flex flex-col gap-4 ${className}`.trim()}>
      {title ? <legend className={FORM_LEGEND_CLASS}>{title}</legend> : null}
      {description ? <p className={FORM_DESC_CLASS}>{description}</p> : null}
      {children}
    </fieldset>
  );
}

export interface FormGridProps {
  cols?: FormCols;
  children: ReactNode;
  className?: string;
}

/** Lay several fields side-by-side on wider viewports; stacks on mobile. */
export function FormGrid({ cols = 2, children, className = '' }: FormGridProps) {
  return <div className={formGridClasses(cols, className)}>{children}</div>;
}

export interface FormActionsProps {
  children: ReactNode;
  /** Push the buttons to the trailing edge (the common footer layout). */
  align?: 'start' | 'end' | 'between';
  className?: string;
}

/** The form footer: a horizontal row of buttons above a hairline divider. */
export function FormActions({ children, align = 'start', className = '' }: FormActionsProps) {
  const justify =
    align === 'end' ? 'justify-end' : align === 'between' ? 'justify-between' : 'justify-start';
  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5 dark:border-white/10 ${justify} ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export interface FormBannerProps {
  tone: BannerTone;
  children: ReactNode;
  className?: string;
}

/** A rounded status banner with the correct `role` for its tone. */
export function FormBanner({ tone, children, className = '' }: FormBannerProps) {
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} className={formBannerClasses(tone, className)}>
      {children}
    </p>
  );
}

/** A danger banner for a form-level error — renders nothing when `message` is empty. */
export function FormError({ message, className }: { message?: ReactNode; className?: string }) {
  if (!message) return null;
  return (
    <FormBanner tone="danger" className={className}>
      {message}
    </FormBanner>
  );
}

/** A success banner for a save confirmation — renders nothing when `message` is empty. */
export function FormSuccess({ message, className }: { message?: ReactNode; className?: string }) {
  if (!message) return null;
  return (
    <FormBanner tone="success" className={className}>
      {message}
    </FormBanner>
  );
}

/* -------------------------------------------------------------------------- */
/*  Connected fields                                                           */
/* -------------------------------------------------------------------------- */

/** Props shared by every register-based field wrapper. */
interface ConnectedFieldBase {
  /** The form field path, e.g. `name` or `variants.0.price`. */
  name: string;
  label?: ReactNode;
  hint?: ReactNode;
  /** Extra `register` options (validation, coercion, min/max…). */
  rules?: RegisterOptions;
  /** Classes for the wrapping `<Field>` element. */
  fieldClassName?: string;
}

export interface TextFieldProps
  extends ConnectedFieldBase, Omit<InputProps, 'name' | 'invalid' | 'defaultValue'> {}

/** A labelled text input bound to the form by `name`, with inline error styling. */
export function TextField({ name, label, hint, rules, fieldClassName, ...input }: TextFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id) => <Input {...input} {...register(name, rules)} id={id} invalid={Boolean(error)} />}
    </Field>
  );
}

/** Like {@link TextField} but registers the value as a number (`valueAsNumber`). */
export function NumberField({ name, rules, ...rest }: TextFieldProps) {
  return (
    <TextField
      name={name}
      type="number"
      rules={{ valueAsNumber: true, ...rules } as RegisterOptions}
      {...rest}
    />
  );
}

export interface TextareaFieldProps
  extends ConnectedFieldBase, Omit<TextareaProps, 'name' | 'invalid' | 'defaultValue'> {}

/** A labelled multi-line input bound to the form by `name`. */
export function TextareaField({
  name,
  label,
  hint,
  rules,
  fieldClassName,
  ...textarea
}: TextareaFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id) => (
        <Textarea {...textarea} {...register(name, rules)} id={id} invalid={Boolean(error)} />
      )}
    </Field>
  );
}

export interface SelectFieldProps
  extends ConnectedFieldBase, Omit<SelectProps, 'name' | 'invalid' | 'defaultValue'> {
  /** The `<option>` list. */
  children: ReactNode;
}

/** A labelled native `<select>` bound to the form by `name`. */
export function SelectField({
  name,
  label,
  hint,
  rules,
  fieldClassName,
  children,
  ...select
}: SelectFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id) => (
        <Select {...select} {...register(name, rules)} id={id} invalid={Boolean(error)}>
          {children}
        </Select>
      )}
    </Field>
  );
}

export interface CheckboxFieldProps extends ConnectedFieldBase {
  /** The inline label shown beside the box (distinct from a section label). */
  children: ReactNode;
}

/**
 * A single checkbox with an inline label. Unlike the other wrappers the label
 * sits *beside* the control; a field-level error is shown underneath.
 */
export function CheckboxField({
  name,
  rules,
  fieldClassName = '',
  children,
  hint,
}: CheckboxFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <div className={`flex flex-col gap-1.5 ${fieldClassName}`.trim()}>
      <label className="flex items-center gap-2.5 text-sm text-ink-700 dark:text-ink-200">
        <input
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 dark:border-white/20 dark:bg-white/[0.04]"
          {...register(name, rules)}
        />
        {children}
      </label>
      {error ? (
        <p className="text-xs font-medium text-danger-600 dark:text-danger-400">{error}</p>
      ) : hint ? (
        <p className={FORM_DESC_CLASS}>{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The form's primary submit button. Wired to `formState.isSubmitting`, it shows
 * a pending label and disables itself mid-submit so a double-click can't fire
 * two mutations.
 */
export function SubmitButton({
  children = 'Save',
  pendingLabel = 'Saving…',
  disabled,
  ...rest
}: BtnProps & { pendingLabel?: ReactNode }) {
  const {
    formState: { isSubmitting },
  } = useFormContext();
  return (
    <Btn type="submit" v="primary" disabled={disabled || isSubmitting} {...rest}>
      {isSubmitting ? pendingLabel : children}
    </Btn>
  );
}

/* -------------------------------------------------------------------------- */
/*  Re-exports                                                                 */
/* -------------------------------------------------------------------------- */

// Surfaced from react-hook-form so consumers share this package's single copy
// of the library (one context) instead of importing it directly.
export { Controller, FormProvider, useFieldArray, useFormContext, useWatch };
export type {
  DefaultValues,
  FieldErrors,
  FieldValues,
  RegisterOptions,
  SubmitHandler,
  UseFormReturn,
};
