// The return-key chain rests on one React 19 behaviour, so it is pinned here.
//
// `AuthField` is `TextField` with a `ref` prop declared and NOTHING else — see
// `field.tsx`. The runtime behaviour it depends on is that React 19 passes `ref`
// to a function component as an ordinary prop, so an undeclared `ref` falls into
// `...rest` and is spread onto the inner `TextInput`. If a future React (or a
// future `TextField` that starts destructuring `rest`) takes that away, the ref
// goes silently null and the only symptom is that the Next key on the keyboard
// stops moving between fields — invisible to every other test in this suite,
// because nothing renders differently.

import { fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { TextField } from '@fit/ui-mobile';
import type { TextInput } from 'react-native';

import { renderApp } from '../../test-support/render';
import { AuthField } from './field';

describe('AuthField', () => {
  it('is `TextField` itself — the cast adds a type, not a wrapper', () => {
    expect(AuthField).toBe(TextField);
  });

  it('forwards `ref` to the inner TextInput', () => {
    const ref = createRef<TextInput>();
    renderApp(<AuthField ref={ref} testID="probe" label="Email" />);

    // The whole chain is this line. A null here is the bug described above.
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe('function');
  });

  it('the chain works end to end: submitting one field focuses the next', () => {
    const ref = createRef<TextInput>();

    function Pair() {
      return (
        <>
          <AuthField
            testID="first"
            label="Email"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => ref.current?.focus()}
          />
          <AuthField ref={ref} testID="second" label="Password" returnKeyType="go" />
        </>
      );
    }

    renderApp(<Pair />);
    const focus = jest.spyOn(ref.current as TextInput, 'focus');

    fireEvent(screen.getByTestId('first-input'), 'submitEditing');

    expect(focus).toHaveBeenCalledTimes(1);
  });
});
