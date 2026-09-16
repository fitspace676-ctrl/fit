// `/onboarding` — two slides, and the one thing this screen must NOT do.
//
// The interesting assertion in this file is a negative: finishing flips the
// flag and nudges `/`, and NEVER routes to `/home` itself. `resolveRedirect`
// holds the whole zone table, and a second authority on the same decision is
// what the deleted app's guard was.
import { fireEvent, waitFor } from '@testing-library/react-native';

import OnboardingScreen from './onboarding';
import { renderScreen } from '../test-support/render-screen';

/**
 * RNTL types a host node's `props` as `any`, so reaching into it is an unsafe
 * member access the shared lint config (correctly) refuses. Narrowed once here.
 */
function a11yValue(node: unknown): { min?: number; max?: number; now?: number } {
  const props = (node as { props?: { accessibilityValue?: unknown } }).props;
  return (props?.accessibilityValue as { now?: number } | undefined) ?? {};
}

// `mock`-prefixed so the hoisted factories may close over them — jest's rule.
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

const mockComplete = jest.fn(() => Promise.resolve());
jest.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({ isComplete: false, isHydrating: false, complete: mockComplete }),
}));

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockComplete.mockClear();
});

/**
 * The titles, in catalogue order — which is the order the screen walks.
 *
 * The catalogue's middle pair is `onboarding.qr.*`, and it is deliberately not
 * here: the QR slide went with the `/qr` screen on 2026-08-31 (Q1 — no scanner
 * integration, no member-scoped check-in endpoint). The keys stay authored and
 * unread; the deck is two slides.
 */
const TITLES = ['Find your next class', 'Shop the store'];

describe('the script', () => {
  it('opens on the first slide the catalogue names', () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    expect(getByTestId('onboarding-screen')).toBeTruthy();
    expect(getByTestId('onboarding-title').children).toEqual([TITLES[0]]);
  });

  it('advances through both, in catalogue order', () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    for (const [i, title] of TITLES.entries()) {
      expect(getByTestId('onboarding-title').children).toEqual([title]);
      if (i < TITLES.length - 1) fireEvent.press(getByTestId('onboarding-next'));
    }
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it('never shows the QR slide — its subject left the app with the screen', () => {
    const { getByTestId, toJSON } = renderScreen(<OnboardingScreen />);
    for (let i = 0; i < TITLES.length; i += 1) {
      expect(JSON.stringify(toJSON())).not.toMatch(/QR/i);
      if (i < TITLES.length - 1) fireEvent.press(getByTestId('onboarding-next'));
    }
  });

  it('mounts exactly one slide, so there is exactly one header', () => {
    // `getAllByRole`, not a props walk over `UNSAFE_root`: the latter counts
    // the composite wrappers around a single host node and reports three.
    const { getAllByRole } = renderScreen(<OnboardingScreen />);
    expect(getAllByRole('header')).toHaveLength(1);
  });

  it('names the CTA for where it is in the deck', () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    expect(getByTestId('onboarding-next').props.accessibilityLabel).toBe('Next');
    fireEvent.press(getByTestId('onboarding-next'));
    expect(getByTestId('onboarding-next').props.accessibilityLabel).toBe('Get started');
  });

  it('reports its position on the pips, which are the only progress there is', () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    expect(a11yValue(getByTestId('onboarding-pips'))).toEqual({ min: 0, max: 2, now: 1 });
    fireEvent.press(getByTestId('onboarding-next'));
    expect(a11yValue(getByTestId('onboarding-pips')).now).toBe(2);
  });
});

describe('finishing', () => {
  it('flips the flag and nudges the guard — it does not route to /home itself', async () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-next'));

    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
    // THE ASSERTION THIS FILE EXISTS FOR. `resolveRedirect` decides where the
    // user lands; this screen only says "the intro is done".
    expect(mockReplace).not.toHaveBeenCalledWith('/home');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('skips from any slide, by the same one call', async () => {
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    fireEvent.press(getByTestId('onboarding-skip'));
    await waitFor(() => {
      expect(mockComplete).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  it('does not navigate before the flag has actually persisted', async () => {
    // `complete()` writes to the store the guard reads. Replacing first is a
    // race the user sees as a flash of the intro on the next cold launch.
    let settle: () => void = () => undefined;
    mockComplete.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { getByTestId } = renderScreen(<OnboardingScreen />);
    fireEvent.press(getByTestId('onboarding-skip'));

    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    settle();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });
});

describe('localisation', () => {
  it('renders no key paths, in either locale, on every slide', () => {
    for (const locale of ['en', 'ka'] as const) {
      const { getByTestId, toJSON } = renderScreen(<OnboardingScreen />, { locale });
      for (let i = 0; i < TITLES.length; i += 1) {
        expect(JSON.stringify(toJSON())).not.toMatch(/"onboarding\.[a-z]/i);
        if (i < TITLES.length - 1) fireEvent.press(getByTestId('onboarding-next'));
      }
    }
  });

  it('is not English-baked', () => {
    const en = renderScreen(<OnboardingScreen />, { locale: 'en' });
    const ka = renderScreen(<OnboardingScreen />, { locale: 'ka' });
    expect(en.getByTestId('onboarding-title').children).toEqual([TITLES[0]]);
    expect(ka.getByTestId('onboarding-title').children).not.toEqual([TITLES[0]]);
  });
});
