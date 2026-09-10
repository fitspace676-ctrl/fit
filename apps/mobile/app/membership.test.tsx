// `/membership` — the alias that keeps an existing, tested link alive.
//
// `components/classes/booking-notice.tsx` pushes `/membership` when a booking is
// refused with 403 `SUBSCRIPTION_FROZEN`, and `app/(tabs)/classes/[id].test.tsx`
// asserts that exact href. C5 put the screen inside the Profile stack, so
// without this route that link lands on expo-router's "Unmatched Route" screen.
//
// The test is deliberately about the DESTINATION rather than about rendering:
// what has to stay true is that `/membership` resolves to the one canonical
// screen, whatever `Redirect` happens to render while it does so.
import { Redirect } from 'expo-router';

import MembershipAlias from './membership';
import { renderApp } from '../test-support/render';

jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
}));

it('sends `/membership` to the canonical screen inside the Profile stack', () => {
  renderApp(<MembershipAlias />);
  const calls = (Redirect as unknown as jest.Mock).mock.calls as unknown as unknown[][];
  const props = calls[0]?.[0] as { href: string } | undefined;
  expect(props?.href).toBe('/profile/membership');
});
