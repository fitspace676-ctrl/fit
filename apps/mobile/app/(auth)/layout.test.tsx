// The `(auth)` group's navigator.
//
// One assertion, and it protects a rule five other spec files depend on: the
// navigator draws NO header. Every screen in this group renders its own through
// `AuthScreen` → `AppBar` → `Heading`, which is the single
// `accessibilityRole="header"` plan §6 item 7 allows per screen. A navigator
// header would silently make it two, on all five at once, and the screens' own
// "exactly one header" assertions would be the ones to fail — a long way from
// the line that caused it.

import { render } from '@testing-library/react-native';

import AuthLayout from './_layout';

// Typed so `mock.calls[0][0]` is a record rather than `any`.
const mockStack = jest.fn<void, [Record<string, unknown>]>();

jest.mock('expo-router', () => ({
  Stack: (props: Record<string, unknown>) => {
    mockStack(props);
    return null;
  },
}));

describe('the (auth) navigator', () => {
  it('shows no header of its own — the screens own that role', () => {
    render(<AuthLayout />);

    expect(mockStack).toHaveBeenCalledTimes(1);
    expect(mockStack.mock.calls[0]?.[0]).toMatchObject({
      screenOptions: { headerShown: false },
    });
  });

  it('leaves the push animation at the platform default', () => {
    render(<AuthLayout />);

    // These five screens are a linear flow (sign in → forgot → back). A modal
    // presentation would put a dismiss gesture on screens with nothing to
    // dismiss to, so the absence of an `animation` / `presentation` override is
    // the decision, and it is worth being able to see it was not lost.
    const options = mockStack.mock.calls[0]?.[0].screenOptions;
    expect(options).not.toHaveProperty('presentation');
    expect(options).not.toHaveProperty('animation');
  });
});
