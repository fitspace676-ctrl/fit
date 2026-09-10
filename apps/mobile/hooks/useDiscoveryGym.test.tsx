// The discovery seam, mounted — the half `useDiscoveryGym.spec.ts` cannot reach.
//
// ===========================================================================
// WHAT IS REAL HERE, AND WHY THAT MATTERS
//
// The session store is REAL (`setSecureStorage` + a fake keychain, then
// `saveTokens` / `endSession`), the `QueryClient` is REAL, `useGymBySlug` and
// `queryKeys` and `resolveGymSlug` are REAL. The only thing stubbed is the
// network call itself, `lib/api/gyms`.
//
// That matters for the one assertion this file exists for: **the retry actually
// retries.** `retry()` is an `invalidateQueries`, never a `.refetch()`, and
// whether invalidating an errored active query re-runs its `queryFn` is a fact
// about TanStack Query — not about this hook. Mocked, the test would prove
// nothing; wired up, it proves the button works.
//
// It also pins "signed in costs no request" against the real query, which is
// the bug C3a's copy had: it ran the public lookup even with a session in hand.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { useDiscoveryGym, useDiscoveryMutationDeps } from './useDiscoveryGym';
import { makeTestQueryClient } from '../test-support/render-screen';
import { env } from '../lib/env';
import { hydrateAuth, resetSessionForTests } from '../lib/auth/session';
import { endSession, saveTokens, setSecureStorage } from '../lib/auth/token-store';

const mockGetGymBySubdomain = jest.fn();
jest.mock('../lib/api/gyms', () => ({
  getGymBySubdomain: (...args: unknown[]) => mockGetGymBySubdomain(...args) as unknown,
}));

/** `env.gymSlug` is `readonly` at the type level and a plain field at runtime. */
type MutableEnv = { gymSlug: string | undefined };

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function tokenFor(gymId: string | null): string {
  const claims: Record<string, unknown> = { sub: 'u_1', role: 'MEMBER', exp: 4_000_000_000 };
  if (gymId !== null) claims.gymId = gymId;
  return `h.${base64url(JSON.stringify(claims))}.s`;
}

/** The public tenant record `GET /gyms/by-subdomain/:slug` answers with. */
const TENANT = { gymId: 'gym_from_slug', name: 'Downtown Strength', brand: null, timezone: 'UTC' };

/** Renders every field a caller branches on, and nothing else. */
function Probe() {
  const gym = useDiscoveryGym();
  const deps = useDiscoveryMutationDeps();
  return (
    <>
      <Text testID="gym-id">{gym.gymId ?? 'none'}</Text>
      <Text testID="gym-phase">{gym.isPending ? 'pending' : gym.isError ? 'error' : 'ready'}</Text>
      <Text testID="deps-gym-id">{deps.gymId ?? 'none'}</Text>
      <Text testID="gym-retry" onPress={gym.retry}>
        retry
      </Text>
    </>
  );
}

function renderProbe() {
  const client = makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, ...render(<Probe />, { wrapper: Wrapper }) };
}

/** Sign in, inside `act` — `saveTokens` notifies the store and re-renders. */
async function signInAs(gymId: string | null): Promise<void> {
  await act(async () => {
    await saveTokens({ accessToken: tokenFor(gymId), refreshToken: 'r1' });
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockGetGymBySubdomain.mockResolvedValue(TENANT);
  setSecureStorage(fakeStorage());
  resetSessionForTests();
  (env as MutableEnv).gymSlug = 'downtown';
  await hydrateAuth();
});

afterEach(async () => {
  await endSession();
  resetSessionForTests();
  setSecureStorage(null);
});

describe('signed in', () => {
  it('takes the token’s claim and makes NO network call', async () => {
    await signInAs('gym_from_token');
    const { getByTestId } = renderProbe();

    expect(getByTestId('gym-id')).toHaveTextContent('gym_from_token');
    expect(getByTestId('gym-phase')).toHaveTextContent('ready');
    // The whole point: the claim is authoritative, so the public lookup is
    // disabled rather than merely ignored.
    expect(mockGetGymBySubdomain).not.toHaveBeenCalled();
  });

  it('is ready on the FIRST frame — never a skeleton for a member', async () => {
    await signInAs('gym_from_token');
    const { getByTestId } = renderProbe();
    expect(getByTestId('gym-phase')).toHaveTextContent('ready');
  });

  it('reports no gym for a session with no active membership, and looks one up', async () => {
    // The API omits `gymId` entirely for a platform account with no membership.
    // That is a signed-in user with no tenant, so discovery is the right answer
    // — the same one a signed-out visitor gets.
    await signInAs(null);
    const { getByTestId } = renderProbe();

    await waitFor(() => {
      expect(getByTestId('gym-id')).toHaveTextContent('gym_from_slug');
    });
  });
});

describe('signed out', () => {
  it('resolves the build’s slug through the public tenant lookup', async () => {
    const { getByTestId } = renderProbe();

    expect(getByTestId('gym-phase')).toHaveTextContent('pending');
    await waitFor(() => {
      expect(getByTestId('gym-id')).toHaveTextContent('gym_from_slug');
    });
    expect(getByTestId('gym-phase')).toHaveTextContent('ready');
    expect(mockGetGymBySubdomain).toHaveBeenCalledWith({ slug: 'downtown' }, expect.anything());
  });

  it('errors immediately with no slug — nothing to look up, nothing to wait for', () => {
    (env as MutableEnv).gymSlug = undefined;
    const { getByTestId } = renderProbe();

    expect(getByTestId('gym-phase')).toHaveTextContent('error');
    expect(getByTestId('gym-id')).toHaveTextContent('none');
    expect(mockGetGymBySubdomain).not.toHaveBeenCalled();
  });

  it('scopes a MUTATION by the same gym — the funnel’s whole problem', async () => {
    // `useMutationDeps()` would hand `null` here, and `requireGymId` would throw
    // on the exact `POST /checkout` a signed-out purchase exists to make.
    const { getByTestId } = renderProbe();
    await waitFor(() => {
      expect(getByTestId('deps-gym-id')).toHaveTextContent('gym_from_slug');
    });
  });
});

describe('the lookup failing', () => {
  it('renders an error whose retry ACTUALLY refetches, and recovers', async () => {
    mockGetGymBySubdomain.mockRejectedValueOnce(new Error('offline'));
    const { getByTestId } = renderProbe();

    await waitFor(() => {
      expect(getByTestId('gym-phase')).toHaveTextContent('error');
    });
    expect(mockGetGymBySubdomain).toHaveBeenCalledTimes(1);

    // `retry()` is an `invalidateQueries`, never a `.refetch()`. Whether that
    // re-runs an errored ACTIVE query is a fact about the library, which is why
    // this test drives a real `QueryClient` rather than a mock.
    fireEvent.press(getByTestId('gym-retry'));

    await waitFor(() => {
      expect(mockGetGymBySubdomain).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(getByTestId('gym-id')).toHaveTextContent('gym_from_slug');
    });
    expect(getByTestId('gym-phase')).toHaveTextContent('ready');
  });

  it('leaves a no-slug retry inert rather than throwing on the press', () => {
    (env as MutableEnv).gymSlug = undefined;
    const { getByTestId } = renderProbe();

    fireEvent.press(getByTestId('gym-retry'));

    expect(mockGetGymBySubdomain).not.toHaveBeenCalled();
    expect(getByTestId('gym-phase')).toHaveTextContent('error');
  });
});

describe('the session changing under a mounted screen', () => {
  it('hands the SESSION’s gym over, and strands no slug-resolved id', async () => {
    const { getByTestId } = renderProbe();
    await waitFor(() => {
      expect(getByTestId('gym-id')).toHaveTextContent('gym_from_slug');
    });

    // The join funnel's exact transition: sign up mid-screen. A stale
    // `gym_from_slug` surviving here is how a key gets minted under one tenant
    // inside another tenant's session.
    await signInAs('gym_from_token');

    expect(getByTestId('gym-id')).toHaveTextContent('gym_from_token');
    expect(getByTestId('deps-gym-id')).toHaveTextContent('gym_from_token');
    expect(getByTestId('gym-phase')).toHaveTextContent('ready');
  });

  it('falls back to the slug again on sign-out', async () => {
    await signInAs('gym_from_token');
    const { getByTestId } = renderProbe();
    expect(getByTestId('gym-id')).toHaveTextContent('gym_from_token');

    await act(async () => {
      await endSession();
    });

    await waitFor(() => {
      expect(getByTestId('gym-id')).toHaveTextContent('gym_from_slug');
    });
  });
});
