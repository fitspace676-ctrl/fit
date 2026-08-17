'use client';

import type { ReactNode } from 'react';
import { useFormContext, type FieldValues, type RegisterOptions } from 'react-hook-form';
import { fieldErrorText } from '@/components/ui';
import {
  Field,
  SelectField as KitSelectField,
  type FieldProps,
  type SelectOption,
  type SelectOptionGroup,
} from '@fit/ui-kit';

/**
 * The console's react-hook-form fields, on `@fit/ui-kit`.
 *
 * `@fit/ui-web` shipped these, and they wrapped its Tailwind `Field`/`Input`/
 * `Select` — the last styled controls in the console still painted by the old
 * system. They live here rather than in the kit because the kit must not depend
 * on react-hook-form: the member portal does not use it, and a design package
 * that drags a form library into every consumer is the wrong shape.
 *
 * So the split is: `@fit/ui-kit` owns how a field LOOKS, `react-hook-form` owns
 * what it is BOUND to, and these forty lines are the seam. The form's own logic
 * — `useZodForm`, `Form`, `fieldErrorText` — stays in `@fit/ui-web`, which is
 * fine: it renders no styling of its own.
 */

interface BoundFieldProps extends Omit<
  FieldProps,
  'name' | 'invalid' | 'hint' | 'value' | 'onChange' | 'defaultValue'
> {
  /** Dot path into the form's values, e.g. `brand.name`. */
  name: string;
  /** Rule-of-the-field copy. Replaced by the validation message when there is one. */
  hint?: string;
  rules?: RegisterOptions<FieldValues, string>;
}

/**
 * A text input bound to the form by `name`.
 *
 * The validation message REPLACES the hint rather than stacking under it: two
 * lines of small print under one control is how a reader stops reading either,
 * and the error is the one that needs the space.
 */
export function TextField({ name, label, hint, rules, ...input }: BoundFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <Field
      label={label}
      hint={error ?? hint}
      invalid={Boolean(error)}
      {...input}
      {...register(name, rules)}
    />
  );
}

/** {@link TextField}, registering the value as a number rather than a string. */
export function NumberField({ name, rules, ...rest }: BoundFieldProps) {
  return (
    <TextField
      name={name}
      type="number"
      // Without `valueAsNumber` the schema receives `"12"` and a `z.number()`
      // rejects a field the reader filled in correctly. The cast is react-hook-
      // form's typing: `RegisterOptions` narrows `valueAsNumber` to the literal
      // `true` in the branch that also forbids `valueAsDate`, and a spread of
      // caller rules widens it back to `boolean`.
      rules={{ valueAsNumber: true, ...rules } as RegisterOptions<FieldValues, string>}
      {...rest}
    />
  );
}

export interface BoundSelectProps {
  name: string;
  label: string;
  hint?: string;
  options: readonly (SelectOption | SelectOptionGroup)[];
  rules?: RegisterOptions<FieldValues, string>;
  disabled?: boolean;
  children?: ReactNode;
}

/** A select bound to the form by `name`. */
export function SelectField({ name, label, hint, options, rules, disabled }: BoundSelectProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = fieldErrorText(errors, name);
  return (
    <KitSelectField
      label={label}
      hint={error ?? hint}
      invalid={Boolean(error)}
      options={options}
      disabled={disabled}
      {...register(name, rules)}
    />
  );
}
