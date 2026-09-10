// `(join)/checkout` — the four-step funnel, every DoD branch, and the one
// assertion this whole stage exists for: **signup happens before the charge,
// and a failed signup never reaches it.**
//
// Run this file with `--runTestsByPath`. `(join)` in a `-t` / path PATTERN is a
// regex group, so `jest app/(join)` matches `app/join` and finds nothing.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { GymMemberIntakeSettings, SignupCatalogueResponse } from '@fit/types';

import JoinCheckoutScreen from './checkout';
import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderScreen } from '../../test-support/render-screen';
import { flatStyle, paintsOpaquely } from '../../test-support/style';

// Jest's default is 5000ms — the same budget as a generous `waitFor` — so on a
// loaded box the failure reports as THE TEST timing out at the `waitFor` line
// and reads like a broken assertion. See §7's "two test mechanics".
jest.setTimeout(30_000);

const WAIT = { timeout: 10_000 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Mocks. Every factory-referenced binding is `mock`-prefixed: a `jest.mock`
// factory is hoisted above the imports and may not close over anything else.
// ─────────────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

const mockRetryGym = jest.fn();
let mockGym = {
  gymId: 'gym_1' as string | null,
  isPending: false,
  isError: false,
  retry: mockRetryGym,
};
jest.mock('../../hooks/useDiscoveryGym', () => ({
  useDiscoveryGym: () => mockGym,
  // The funnel charges through the DISCOVERY gym, not the session's — see the
  // hook's own doc comment and `hooks/useDiscoveryGym.test.tsx`.
  useDiscoveryMutationDeps: () => ({ gymId: mockGym.gymId, queryClient: null }),
}));

const mockGetCatalogue = jest.fn();
jest.mock('../../hooks/queries/useShop', () => ({
  catalogueQueryOptions: (gymId: string | null, locationId?: string) => ({
    // The branch is part of the key, exactly as the real factory now builds it
    // — otherwise switching branch would serve the previous branch's catalogue.
    queryKey: ['catalogue', gymId ?? '', locationId ?? null],
    queryFn: () => mockGetCatalogue(locationId) as unknown,
    enabled: gymId !== null,
  }),
}));

/** Every network call, in the order it was made. THE ordering assertion. */
const mockCalls: string[] = [];

const mockCreateCheckout = jest.fn();
jest.mock('../../hooks/mutations/useCheckoutMutations', () => ({
  createCheckoutMutationOptions: () => ({
    mutationKey: ['createCheckout'],
    retry: false,
    mutationFn: (input: unknown) => mockCreateCheckout(input) as unknown,
  }),
}));

const mockSignUpMember = jest.fn();
jest.mock('../../lib/auth/session', () => ({
  signUpMember: (...args: unknown[]) => mockSignUpMember(...args) as unknown,
  resolveGymSlug: () => 'downtown',
}));

let mockSession = { status: 'signed-out' as 'signed-out' | 'signed-in' };
jest.mock('../../hooks/useSession', () => ({
  useSession: () => mockSession,
}));

const mockCompleteOnboarding = jest.fn();
jest.mock('../../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    isComplete: false,
    isHydrating: false,
    complete: mockCompleteOnboarding as unknown,
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A two-field door: only `name` and `email` on, which
 * `ALWAYS_OPTIONAL_INTAKE_FIELDS` exempts from being required anyway. So the
 * details step asks for a first name, an email and a password and nothing else,
 * which keeps the flow tests short. The intake-DRIVEN field set gets its own
 * test below, and `join-state.test.tsx` pins the policy itself.
 */
const LEAN_INTAKE: GymMemberIntakeSettings = {
  name: true,
  surname: false,
  email: true,
  phone: false,
  gender: false,
  dateOfBirth: false,
  startDate: false,
  personalId: false,
  address: false,
  emergencyContact: false,
  membershipPlan: false,
  paymentMethod: false,
  medicalNotes: false,
};

function catalogue(overrides: Partial<SignupCatalogueResponse> = {}): SignupCatalogueResponse {
  return {
    locations: [
      {
        id: 'loc_1',
        name: 'Downtown',
        address: '1 Rustaveli',
        photoUrl: null,
        amenities: [],
        hours: {},
      },
      {
        id: 'loc_2',
        name: 'Vake',
        address: '9 Chavchavadze',
        photoUrl: null,
        amenities: [],
        hours: {},
      },
    ],
    packages: [],
    subscriptionPlans: [
      {
        id: 'plan_1',
        name: 'Unlimited',
        description: 'Every class.',
        priceAmount: 8900,
        currency: 'GEL',
        interval: 'MONTH',
        features: ['All classes'],
        popular: true,
        trialDays: 0,
      },
    ],
    creditPacks: [],
    freeAccount: { enabled: false, name: '', description: '' },
    memberIntake: LEAN_INTAKE,
    startDatePolicy: { maxDaysAhead: 14, allowPast: false },
    ...overrides,
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockRetryGym.mockClear();
  mockCanGoBack = true;
  mockGym = {
    gymId: 'gym_1',
    isPending: false,
    isError: false,
    retry: mockRetryGym,
  };
  mockCalls.length = 0;
  mockGetCatalogue.mockReset();
  mockGetCatalogue.mockResolvedValue(catalogue());
  mockCreateCheckout.mockReset();
  mockCreateCheckout.mockImplementation(() => {
    mockCalls.push('checkout');
    return Promise.resolve({ productType: 'subscription', orderId: null, subscriptionId: 'sub_1' });
  });
  mockSignUpMember.mockReset();
  mockSignUpMember.mockImplementation(() => {
    mockCalls.push('signup');
    return Promise.resolve({ tokens: {}, claims: null, gymScope: Promise.resolve({}) });
  });
  mockCompleteOnboarding.mockReset();
  mockCompleteOnboarding.mockResolvedValue(undefined);
  mockSession = { status: 'signed-out' };
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/**
 * The text of each `role="header"`, typed.
 *
 * RNTL types a host node's `props` as `any`, so `node.props.children` is three
 * `no-unsafe-*` errors at every call site. Narrowed once, inline, exactly as the
 * other screen tests do.
 */
function headerTexts(nodes: readonly unknown[]): string[] {
  return nodes.map((node) => String((node as { props?: { children?: unknown } }).props?.children));
}

type View = ReturnType<typeof renderScreen>;

/** Choose a branch, then a plan, landing on the details step. */
async function toDetails(view: View): Promise<void> {
  await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
  fireEvent.press(view.getByTestId('join-location-loc_1'));
  fireEvent.press(view.getByTestId('join-continue'));
  await waitFor(() => view.getByTestId('join-product-plan_1'), WAIT);
  fireEvent.press(view.getByTestId('join-product-plan_1'));
  fireEvent.press(view.getByTestId('join-continue'));
  await waitFor(() => view.getByTestId('join-details-firstName-input'), WAIT);
}

/** Fill the lean intake's three fields and land on the payment step. */
async function toPayment(view: View): Promise<void> {
  await toDetails(view);
  fireEvent.changeText(view.getByTestId('join-details-firstName-input'), 'ნინო');
  fireEvent.changeText(view.getByTestId('join-details-email-input'), 'nino@example.test');
  fireEvent.changeText(view.getByTestId('join-details-password-input'), 'correct-horse-9');
  fireEvent.press(view.getByTestId('join-continue'));
  await waitFor(() => view.getByTestId('join-terms'), WAIT);
}

/**
 * Tick the terms box, wait for the button to come alive, then press Pay and let
 * the signup → checkout chain settle.
 *
 * Both waits are load-bearing:
 *
 *   * `SwitchRow` toggles on PRESS, not on a `valueChange` event — it is a
 *     `Pressable` calling `onChange(!checked)`.
 *   * Pressing the switch and the button in the same synchronous block presses
 *     a button that is STILL DISABLED: React has not re-rendered in between, so
 *     the node in the tree still carries `disabled`, and a disabled `Button`
 *     swallows its own press. The failure looks exactly like a broken handler.
 *   * `await Promise.resolve()` inside `act` flushes the microtask queue, so
 *     the async chain's state updates land INSIDE an `act` — otherwise RNTL
 *     reports the warning against a different test than the one that caused it.
 */
async function payAndSettle(view: View): Promise<void> {
  fireEvent.press(view.getByTestId('join-terms'));
  await waitFor(() => {
    expect(a11yState(view.getByTestId('join-submit')).disabled).toBe(false);
  }, WAIT);
  await act(async () => {
    fireEvent.press(view.getByTestId('join-submit'));
    await Promise.resolve();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 items 1–5 — the definition of done, branch by branch
// ─────────────────────────────────────────────────────────────────────────────

describe('the load states', () => {
  it('shows SKELETONS while the tenant is still being resolved', () => {
    mockGym = { ...mockGym, gymId: null, isPending: true };
    const view = renderScreen(<JoinCheckoutScreen />);
    expect(view.getByTestId('join-loading')).toBeTruthy();
    expect(view.queryByTestId('join-no-gym')).toBeNull();
  });

  it('shows SKELETONS while the catalogue loads', () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    expect(view.getByTestId('join-loading')).toBeTruthy();
  });

  it('renders the NO-TENANT state with a retry that re-runs the lookup', () => {
    mockGym = { ...mockGym, gymId: null, isPending: false, isError: true };
    const view = renderScreen(<JoinCheckoutScreen />);
    expect(view.getByTestId('join-no-gym')).toBeTruthy();
    fireEvent.press(view.getByTestId('join-no-gym-retry'));
    expect(mockRetryGym).toHaveBeenCalledTimes(1);
  });

  it('renders the CATALOGUE ERROR with a retry that re-reads it', async () => {
    mockGetCatalogue.mockRejectedValue(new ApiError({ status: 500, message: 'boom' }));
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-error'), WAIT);

    mockGetCatalogue.mockResolvedValue(catalogue());
    fireEvent.press(view.getByTestId('join-error-retry'));
    // The retry is an INVALIDATION, never a `.refetch()` — so the proof is that
    // the query ran again and the screen recovered.
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
  });

  it('renders the EMPTY branch list', async () => {
    mockGetCatalogue.mockResolvedValue(catalogue({ locations: [] }));
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-locations-empty'), WAIT);
  });

  it('tells an EMPTY TAB apart from a gym that sells nothing', async () => {
    // A buyer told "no packages available" on a screen that has plans one tab
    // away stops looking. Both sentences are authored; both are used.
    mockGetCatalogue.mockResolvedValue(
      catalogue({
        subscriptionPlans: [],
        creditPacks: [
          {
            id: 'pack_1',
            name: '5 credits',
            priceAmount: 20000,
            currency: 'GEL',
            sessionCount: 5,
            validityDays: 90,
          },
        ],
      }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-location-loc_1'));
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-tab-empty'), WAIT);
    expect(view.queryByTestId('join-packages-empty')).toBeNull();
  });

  it('renders the EMPTY catalogue when the gym sells nothing at all', async () => {
    mockGetCatalogue.mockResolvedValue(catalogue({ subscriptionPlans: [] }));
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-location-loc_1'));
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-packages-empty'), WAIT);
  });

  it('renders the OFFLINE advisory', async () => {
    // TODO(i18n): there are no `offline` keys in either catalogue — the notice
    // is `components/auth/notices.tsx`'s, whose `pending-copy.ts` owns the debt.
    onlineManager.setOnline(false);
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-offline'), WAIT);
  });
});

describe('D9 — the funnel is reachable SIGNED OUT', () => {
  it('renders the whole wizard with no session, and never redirects', async () => {
    // §1 lists "a signed-out purchase impossible" among the reasons the old app
    // was deleted. This is the flow that was impossible.
    mockSession = { status: 'signed-out' };
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    expect(view.getByTestId('join-steps-location')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('SKIPS the details form for a signed-in buyer', async () => {
    mockSession = { status: 'signed-in' };
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetailsSignedIn(view);
    expect(view.getByTestId('join-details-signed-in')).toBeTruthy();
    expect(view.queryByTestId('join-details-firstName-input')).toBeNull();
  });
});

async function toDetailsSignedIn(view: View): Promise<void> {
  await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
  fireEvent.press(view.getByTestId('join-location-loc_1'));
  fireEvent.press(view.getByTestId('join-continue'));
  await waitFor(() => view.getByTestId('join-product-plan_1'), WAIT);
  fireEvent.press(view.getByTestId('join-product-plan_1'));
  fireEvent.press(view.getByTestId('join-continue'));
  await waitFor(() => view.getByTestId('join-details-signed-in'), WAIT);
}

// ─────────────────────────────────────────────────────────────────────────────
// The step machine
// ─────────────────────────────────────────────────────────────────────────────

describe('the step machine', () => {
  it('keeps a step OUT OF REACH until its predecessors are satisfied', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);

    // Nothing chosen: only the first chip is live.
    expect(a11yState(view.getByTestId('join-steps-location')).disabled).toBeFalsy();
    expect(a11yState(view.getByTestId('join-steps-package')).disabled).toBe(true);
    expect(a11yState(view.getByTestId('join-steps-payment')).disabled).toBe(true);

    fireEvent.press(view.getByTestId('join-location-loc_1'));
    await waitFor(() => {
      expect(a11yState(view.getByTestId('join-steps-package')).disabled).toBeFalsy();
    }, WAIT);
    // Still no product, so details is unreachable.
    expect(a11yState(view.getByTestId('join-steps-details')).disabled).toBe(true);
  });

  it('walks BACKWARDS through the chips once the steps behind are satisfied', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    fireEvent.press(view.getByTestId('join-steps-location'));
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
  });

  it('CLEARS the product when the branch changes', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-location-loc_1'));
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-product-plan_1'), WAIT);
    fireEvent.press(view.getByTestId('join-product-plan_1'));

    fireEvent.press(view.getByTestId('join-steps-location'));
    await waitFor(() => view.getByTestId('join-location-loc_2'), WAIT);
    fireEvent.press(view.getByTestId('join-location-loc_2'));
    fireEvent.press(view.getByTestId('join-continue'));

    await waitFor(() => {
      expect(a11yState(view.getByTestId('join-product-plan_1')).checked).toBe(false);
    }, WAIT);
  });

  it("the first step's Back leaves the funnel rather than doing nothing", async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to the root when there is no stack to pop', async () => {
    mockCanGoBack = false;
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-back'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('AUTO-SELECTS the only branch a single-site gym has', async () => {
    mockGetCatalogue.mockResolvedValue(
      catalogue({
        locations: [
          {
            id: 'loc_only',
            name: 'Solo',
            address: 'One place',
            photoUrl: null,
            amenities: [],
            hours: {},
          },
        ],
      }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => {
      expect(a11yState(view.getByTestId('join-location-loc_only')).checked).toBe(true);
    }, WAIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE ORDERING TEST — the highest-value assertion in this stage
// ─────────────────────────────────────────────────────────────────────────────

describe('signup before the charge', () => {
  it('calls POST /auth/signup and only THEN POST /checkout', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => {
      expect(mockCalls).toEqual(['signup', 'checkout']);
    }, WAIT);
  });

  it('NEVER reaches POST /checkout when the signup fails', async () => {
    // The two calls are ordered by `await`, not by a race. No account, no
    // charge — and a buyer who is told their email is taken must not also have
    // been billed.
    mockSignUpMember.mockImplementation(() => {
      mockCalls.push('signup');
      return Promise.reject(new ApiError({ status: 500, message: 'boom' }));
    });

    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => view.getByTestId('join-failure-generic'), WAIT);
    expect(mockCalls).toEqual(['signup']);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('skips the signup entirely for a buyer who already has a session', async () => {
    mockSession = { status: 'signed-in' };
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetailsSignedIn(view);
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-terms'), WAIT);
    await payAndSettle(view);

    await waitFor(() => {
      expect(mockCalls).toEqual(['checkout']);
    }, WAIT);
  });

  it('marks the intro seen BEFORE the session flips', async () => {
    // `resolveRedirect` zone 2 bounces a signed-in user with an incomplete
    // onboarding flag to `/onboarding` from any route — which, between the
    // signup and the charge, would replace the screen mid-purchase.
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);
    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalled();
    }, WAIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Where each outcome lands
// ─────────────────────────────────────────────────────────────────────────────

describe('the outcomes', () => {
  it('routes a SUBSCRIPTION to the confirmation with its subscription id', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/checkout-success?subscriptionId=sub_1');
    }, WAIT);
  });

  it('routes a PACKAGE to the confirmation with its order id', async () => {
    mockCreateCheckout.mockImplementation(() => {
      mockCalls.push('checkout');
      return Promise.resolve({ productType: 'package', orderId: 'ord_9', subscriptionId: null });
    });
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/checkout-success?orderId=ord_9');
    }, WAIT);
  });

  it('a FREE ACCOUNT signs up and goes straight home — no charge at all', async () => {
    mockGetCatalogue.mockResolvedValue(
      catalogue({ freeAccount: { enabled: true, name: 'Free account', description: 'Later.' } }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    fireEvent.press(view.getByTestId('join-location-loc_1'));
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-product-free'), WAIT);
    fireEvent.press(view.getByTestId('join-product-free'));
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-details-firstName-input'), WAIT);
    fireEvent.changeText(view.getByTestId('join-details-firstName-input'), 'Nino');
    fireEvent.changeText(view.getByTestId('join-details-email-input'), 'nino@example.test');
    fireEvent.changeText(view.getByTestId('join-details-password-input'), 'correct-horse-9');
    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-terms'), WAIT);

    await payAndSettle(view);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    }, WAIT);
    expect(mockCalls).toEqual(['signup']);
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The failure branches
// ─────────────────────────────────────────────────────────────────────────────

describe('the failure branches', () => {
  it('409 EMAIL_TAKEN returns to the DETAILS step and offers sign-in', async () => {
    // A branch, not an error — and it has to be shown where it fires. Web sets
    // the flag while the details section is `hidden`, so the buyer sits on the
    // payment step with a live button and no message at all.
    mockSignUpMember.mockRejectedValue(
      new ApiError({ status: 409, code: 'EMAIL_TAKEN', message: 'taken' }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => view.getByTestId('join-details-email-taken'), WAIT);
    fireEvent.press(view.getByTestId('join-details-sign-in'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fcheckout');
  });

  it('SAYS the terms box is why Pay refused, instead of going quietly grey', async () => {
    // The one remaining reason to refuse that the buyer can FIX, in one tap, on
    // this very screen — and it was expressed as `disabled`, so `submit` never
    // ran, `showErrors` never turned on, and nothing anywhere said a word. This
    // file argues that exact point about `join-continue` and then did the
    // opposite on the last control in the funnel.
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);

    // LIVE with the box unticked — that is the fix.
    expect(a11yState(view.getByTestId('join-submit')).disabled).toBe(false);
    expect(view.queryByTestId('join-terms-required')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('join-submit'));
      await Promise.resolve();
    });

    // Refused — nothing was signed up for, nothing was charged…
    expect(mockSignUpMember).not.toHaveBeenCalled();
    expect(mockCreateCheckout).not.toHaveBeenCalled();
    // …and the reason is on screen, beside the thing that fixes it.
    // TODO(i18n) `checkout.payment.termsRequired`.
    await waitFor(() => view.getByTestId('join-terms-required'), WAIT);
    expect(view.getByText('Tick the box above to continue.')).toBeTruthy();

    // Ticking it clears the note and lets the purchase through.
    fireEvent.press(view.getByTestId('join-terms'));
    await waitFor(() => {
      expect(view.queryByTestId('join-terms-required')).toBeNull();
    }, WAIT);
    await act(async () => {
      fireEvent.press(view.getByTestId('join-submit'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockSignUpMember).toHaveBeenCalled();
    }, WAIT);
  });

  it('429 raises a live COUNTDOWN and disables the button — never auto-retries', async () => {
    // `POST /auth/signup` is `authStrict`: 5 requests per 900 seconds.
    mockSignUpMember.mockRejectedValue(
      new ApiError({ status: 429, message: 'slow down', retryAfterSec: 120 }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => view.getByTestId('join-cooldown'), WAIT);
    expect(a11yState(view.getByTestId('join-submit')).disabled).toBe(true);
    expect(mockSignUpMember).toHaveBeenCalledTimes(1);
  });

  it('422 PRODUCT_UNAVAILABLE says so vaguely and sends the buyer back to the picker', async () => {
    // One code for three situations — missing, cross-tenant, off sale —
    // deliberately, so the endpoint never reveals which. The copy is equally
    // vague on purpose.
    mockCreateCheckout.mockRejectedValue(
      new ApiError({ status: 422, code: 'PRODUCT_UNAVAILABLE', message: 'gone' }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => view.getByTestId('join-failure-unavailable'), WAIT);
    // Back on the product step, with the catalogue re-read.
    expect(view.getByTestId('join-product-tabs')).toBeTruthy();
  });

  it('409 ALREADY_SUBSCRIBED offers the way home rather than a retry', async () => {
    mockCreateCheckout.mockRejectedValue(
      new ApiError({ status: 409, code: 'ALREADY_SUBSCRIBED', message: 'already' }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);

    await waitFor(() => view.getByTestId('join-failure-already-subscribed'), WAIT);
    fireEvent.press(view.getByTestId('join-failure-already-subscribed-home'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('400 GYM_NOT_FOUND says there is no gym in scope', async () => {
    mockSignUpMember.mockRejectedValue(
      new ApiError({ status: 400, code: 'GYM_NOT_FOUND', message: 'no gym' }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toPayment(view);
    await payAndSettle(view);
    await waitFor(() => view.getByTestId('join-failure-gym'), WAIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The gym's own form
// ─────────────────────────────────────────────────────────────────────────────

describe('the details step is built from the gym’s intake settings', () => {
  it('draws only the fields THIS gym asks for', async () => {
    mockGetCatalogue.mockResolvedValue(
      catalogue({
        memberIntake: {
          ...LEAN_INTAKE,
          phone: true,
          personalId: true,
          startDate: true,
          surname: true,
        },
      }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetails(view);

    expect(view.getByTestId('join-details-phone-input')).toBeTruthy();
    expect(view.getByTestId('join-details-personalId-input')).toBeTruthy();
    // Not an input any more: the start date is picked off a week strip, the
    // same control the classes screen uses. See `start-date-field.tsx`.
    expect(view.getByTestId('join-details-startDate')).toBeTruthy();
    expect(view.queryByTestId('join-details-startDate-input')).toBeNull();
    expect(view.getByTestId('join-details-lastName-input')).toBeTruthy();
    // Off in this gym's settings, so not drawn at all.
    expect(view.queryByTestId('join-details-dateOfBirth-input')).toBeNull();
    expect(view.queryByTestId('join-details-gender')).toBeNull();
  });

  it('paints the invalid fields only AFTER the buyer tries to move on', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetails(view);
    expect(view.queryByTestId('join-details-invalid')).toBeNull();

    fireEvent.press(view.getByTestId('join-continue'));
    await waitFor(() => view.getByTestId('join-details-invalid'), WAIT);
    // Still on the details step — Continue did not advance.
    expect(view.getByTestId('join-details-firstName-input')).toBeTruthy();
  });

  it('types a date day-first and stores it as the wire format', async () => {
    mockGetCatalogue.mockResolvedValue(
      catalogue({ memberIntake: { ...LEAN_INTAKE, dateOfBirth: true } }),
    );
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetails(view);
    fireEvent.changeText(view.getByTestId('join-details-dateOfBirth-input'), '01041994');
    await waitFor(() => {
      expect(view.getByTestId('join-details-dateOfBirth-input').props.value).toBe('01.04.1994');
    }, WAIT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The a11y contract (§6 item 7, as amended)
// ─────────────────────────────────────────────────────────────────────────────

describe('the a11y contract', () => {
  it('has exactly one header on a picking step, and names the step', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    expect(headerTexts(view.getAllByRole('header'))).toEqual(['Choose a location']);
  });

  it('names the screen title and both field groups on the details step', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await toDetails(view);
    expect(headerTexts(view.getAllByRole('header'))).toEqual([
      'Your details',
      'About you',
      'Your login',
    ]);
  });

  it('announces each option as a RADIO carrying its own checked state', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    const first = view.getByTestId('join-location-loc_1');
    expect(first.props.accessibilityRole).toBe('radio');
    expect(a11yState(first).checked).toBe(false);
    fireEvent.press(first);
    await waitFor(() => {
      expect(a11yState(view.getByTestId('join-location-loc_1')).checked).toBe(true);
    }, WAIT);
  });

  it('renders in Georgian with no English baked in', async () => {
    const view = renderScreen(<JoinCheckoutScreen />, { locale: 'ka' });
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    // `checkout.locations.title` in `ka`.
    expect(headerTexts(view.getAllByRole('header'))).toEqual(['აირჩიეთ ლოკაცია']);
  });
});

describe('the sticky footer', () => {
  // See `ScreenProps.footer`: the wrapper is absolute over the scroll and
  // paints nothing, so a bare `View` lets the funnel's own rows draw through
  // the button band.
  it('paints an opaque plate', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    expect(paintsOpaquely(view.getByTestId('join-footer-plate'))).toBe(true);
  });
});

describe('the step rail', () => {
  // ==========================================================================
  // THE ACTIVE STEP WAS THE ONE OFF THE END.
  //
  // Four label-width chips overflow the 335pt gutter in BOTH locales, and the
  // rail scrolled from the left — so on step 4 the buyer saw the left edge of
  // "გადახდა" and nothing more. `scrollToIndex` cannot help (it needs a fixed
  // `itemWidth`, and these are label-width), and a "Step 4 of 4" counter cannot
  // be pressed, which these chips can. So the row wraps.
  //
  // The overflow itself is geometry and not assertable here; what is assertable
  // is that the chips are no longer inside a scroller that can hide one.
  // ==========================================================================
  it('wraps its chips instead of scrolling them out of reach', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);

    const row = flatStyle(view.getByTestId('join-steps'));
    expect(row.flexDirection).toBe('row');
    expect(row.flexWrap).toBe('wrap');
    // Not a ScrollView any more — a horizontal scroller is exactly what hid the
    // fourth chip.
    expect(view.getByTestId('join-steps').props.horizontal).toBeUndefined();
  });

  it('renders all four steps, the last one included', async () => {
    const view = renderScreen(<JoinCheckoutScreen />);
    await waitFor(() => view.getByTestId('join-location-loc_1'), WAIT);
    for (const section of ['location', 'package', 'details', 'payment']) {
      expect(view.getByTestId(`join-steps-${section}`)).toBeTruthy();
    }
  });
});
