// @fit/mobile — `TextField`, addressable by a ref.
//
// ===========================================================================
// THE RETURN-KEY CHAIN NEEDS A REF, AND `TextField` DOES NOT DECLARE ONE.
// ===========================================================================
//
// `@fit/ui-mobile`'s `TextField` is a plain function component whose props are
// `Omit<TextInputProps, …>` plus its own — and `TextInputProps` has no `ref`. It
// is not a `forwardRef`, so TypeScript rejects `<TextField ref={…} />` even
// though the underlying `<TextInput {...rest} />` is exactly what a ref should
// land on.
//
// It lands on it anyway. **React 19 passes `ref` to a function component as an
// ordinary prop** — `forwardRef` is no longer required — so a `ref` handed to
// `TextField` is not destructured, falls into `...rest`, and is spread straight
// onto the `TextInput`. The behaviour is correct; only the type is missing.
//
// So this is a TYPE-ONLY re-declaration. There is no wrapper component, no extra
// node in the tree, and no behaviour of its own — `AuthField === TextField` at
// runtime, which `field.test.tsx` asserts alongside the ref actually arriving,
// because the whole thing rests on a React 19 behaviour that a future major
// could take away and a silently-null ref would degrade to "the Next key does
// nothing" with no test failure anywhere.
//
// The alternative was to add `forwardRef` to `ui-mobile`, which this stage does
// not own. That is the right long-term fix and is owed back to WP-6: `TextField`
// should declare `ref?: Ref<TextInput>` explicitly. Until it does, the cast is
// here, once, with this note attached to it.

import { TextField, type TextFieldProps } from '@fit/ui-mobile';
import type { ReactElement, Ref } from 'react';
import type { TextInput } from 'react-native';

export type AuthFieldProps = TextFieldProps & {
  /** The `TextInput` inside, for the return-key chain. */
  ref?: Ref<TextInput>;
};

/** `TextField`, with `ref` declared. Identical at runtime. */
export const AuthField = TextField as unknown as (props: AuthFieldProps) => ReactElement;
