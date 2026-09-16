// `/profile/edit` — the four §6 branches, and the one request shape that
// matters.
//
// The assertion this file exists for is `sends ONLY the field that changed`.
// `PATCH /me/profile` is `.strict()` and writes exactly what it is given, so a
// form that posts `{name, phone}` on every save cannot be told apart from one
// that posts the diff — the response is identical — right up until a member
// with a phone number saves a name and the number is re-sent, or a member
// clears a phone and the key is absent. Only a spy on the request body sees it.
//
// The transport is mocked and everything above it is real, for the reason
// `home.test.tsx` gives at length: mocking the hooks would let a test assert a
// state the query library cannot produce.
//
// `renderApp`, not `renderScreen`: the save path calls `useToast`.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type { GetMeProfileResponse } from '@fit/types';

import EditProfileScreen from './edit';
import { a11yState } from '../../../test-support/a11y';
import { renderApp } from '../../../test-support/render';
import { ApiError } from '../../../lib/http/api-error';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: (href: string) => mockReplace(href) as unknown,
    back: () => mockBack() as unknown,
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockGetMyProfile = jest.fn();
const mockUpdateMyProfile = jest.fn();
jest.mock('../../../lib/api/me', () => ({
  getMyProfile: () => mockGetMyProfile() as unknown,
  updateMyProfile: (input: unknown) => mockUpdateMyProfile(input) as unknown,
  getMyGoals: () => Promise.resolve({ goals: [] }),
  getMySubscription: () => Promise.resolve({ subscription: null, invoices: [] }),
}));

function response(overrides: Partial<GetMeProfileResponse['profile']> = {}): GetMeProfileResponse {
  return {
    profile: {
      userId: 'user_1',
      name: 'ანა გელაშვილი',
      email: 'ana@example.com',
      phone: '+995 555 10 20 30',
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
  mockGetMyProfile.mockReset();
  mockUpdateMyProfile.mockReset();
  mockGetMyProfile.mockResolvedValue(response());
  mockUpdateMyProfile.mockImplementation((input: Record<string, unknown>) =>
    Promise.resolve(response(input as Partial<GetMeProfileResponse['profile']>)),
  );
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

// ===========================================================================
// §6 items 1–4: loading, error with a WORKING retry, offline.
// ===========================================================================
describe('the four branches', () => {
  it('skeletons while the profile is in flight, and names the wait', async () => {
    let resolve: ((value: GetMeProfileResponse) => void) | undefined;
    mockGetMyProfile.mockReturnValue(
      new Promise<GetMeProfileResponse>((r) => {
        resolve = r;
      }),
    );

    const { findByTestId, queryByTestId } = renderApp(<EditProfileScreen />);
    const loading = await findByTestId('profile-edit-loading', {}, WAIT);
    expect(loading.props.accessibilityLabel).toBe('Loading your profile…');
    // No dead Save under a skeleton — the footer only exists once there is a
    // form to save.
    expect(queryByTestId('profile-edit-save')).toBeNull();

    resolve?.(response());
    await findByTestId('profile-edit-form', {}, WAIT);
  });

  it('offers a retry that actually refetches', async () => {
    mockGetMyProfile.mockRejectedValueOnce(new ApiError({ status: 500, code: 'INTERNAL_ERROR' }));

    const { findByTestId } = renderApp(<EditProfileScreen />);
    fireEvent.press(await findByTestId('profile-edit-retry', {}, WAIT));

    // The retry invalidates the query root; the second call is the proof it is
    // not a decorative button.
    await findByTestId('profile-edit-form', {}, WAIT);
    expect(mockGetMyProfile.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('says the radio is dead rather than skeletoning forever', async () => {
    // A paused query is `isPending` for the rest of the session and never
    // becomes `isError`, so without this branch the screen never resolves.
    onlineManager.setOnline(false);
    const { findByTestId } = renderApp(<EditProfileScreen />);
    await findByTestId('profile-edit-offline', {}, WAIT);
  });

  it('seeds the form from the server', async () => {
    const { findByTestId } = renderApp(<EditProfileScreen />);
    expect((await findByTestId('profile-edit-name-input', {}, WAIT)).props.value).toBe(
      'ანა გელაშვილი',
    );
    expect((await findByTestId('profile-edit-phone-input', {}, WAIT)).props.value).toBe(
      '+995 555 10 20 30',
    );
  });
});

// ===========================================================================
// THE PATCH. Only what moved.
// ===========================================================================
describe('the request', () => {
  it('sends ONLY the field that changed', async () => {
    const { findByTestId, getByTestId } = renderApp(<EditProfileScreen />);
    const name = await findByTestId('profile-edit-name-input', {}, WAIT);

    fireEvent.changeText(name, 'ანა ბერიძე');
    fireEvent.press(getByTestId('profile-edit-save'));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledTimes(1);
    }, WAIT);
    // The phone is ABSENT, not re-sent. The web portal sends it on every save.
    expect(mockUpdateMyProfile).toHaveBeenCalledWith({ name: 'ანა ბერიძე' });
  });

  it('clears a phone with an explicit null', async () => {
    const { findByTestId, getByTestId } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-phone-input', {}, WAIT), '');
    fireEvent.press(getByTestId('profile-edit-save'));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledWith({ phone: null });
    }, WAIT);
  });

  it('refuses to fire an empty PATCH, and says why', async () => {
    const { findByTestId, getByTestId } = renderApp(<EditProfileScreen />);
    await findByTestId('profile-edit-form', {}, WAIT);

    fireEvent.press(getByTestId('profile-edit-save'));

    // An empty `.strict()` body is a legal 200 that writes nothing — the member
    // would get a "Profile saved" toast for a save that never happened.
    const note = await findByTestId('profile-edit-note', {}, WAIT);
    expect(note).toBeTruthy();
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
  });

  it('re-seeds from the server’s answer, so a trimmed name is what is shown', async () => {
    mockUpdateMyProfile.mockResolvedValue(response({ name: 'ნინო' }));

    const { findByTestId, getByTestId } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-name-input', {}, WAIT), '  ნინო  ');
    fireEvent.press(getByTestId('profile-edit-save'));

    await waitFor(() => {
      expect(getByTestId('profile-edit-name-input').props.value).toBe('ნინო');
    }, WAIT);
  });
});

// ===========================================================================
// What the form refuses, and how it explains itself.
// ===========================================================================
describe('the rules the member meets', () => {
  it('explains a cleared name rather than silently keeping the old one', async () => {
    const { findByTestId, getByTestId } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-name-input', {}, WAIT), '   ');
    fireEvent.press(getByTestId('profile-edit-save'));

    // `name` is `min(1)` and NOT nullable — there is no request that removes a
    // name, so the form has to say so. The web portal drops the key instead.
    await findByTestId('profile-edit-name-error', {}, WAIT);
    expect(mockUpdateMyProfile).not.toHaveBeenCalled();
  });

  it('lets a member who never had a name save a phone', async () => {
    mockGetMyProfile.mockResolvedValue(response({ name: null, phone: null }));

    const { findByTestId, getByTestId, queryByTestId } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-phone-input', {}, WAIT), '555');
    fireEvent.press(getByTestId('profile-edit-save'));

    await waitFor(() => {
      expect(mockUpdateMyProfile).toHaveBeenCalledWith({ phone: '555' });
    }, WAIT);
    expect(queryByTestId('profile-edit-name-error')).toBeNull();
  });

  it('Save is LIVE, not disabled — a disabled button cannot explain itself', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<EditProfileScreen />);
    await findByTestId('profile-edit-form', {}, WAIT);

    // Nothing has changed, so the press cannot post — and it must still RUN,
    // or the note below would never appear.
    expect(queryByTestId('profile-edit-note')).toBeNull();
    // `ReactTestInstance['props']` is `any`; `a11yState` is the one typed
    // accessor the app's tests read a control's state through.
    expect(a11yState(getByTestId('profile-edit-save')).disabled).toBe(false);
    fireEvent.press(getByTestId('profile-edit-save'));
    await findByTestId('profile-edit-note', {}, WAIT);
  });

  it('shows the email and refuses to edit it', async () => {
    // `.strict()` makes an `email` key a 400. The web portal renders the input
    // anyway and drops the value before the request.
    const { findByTestId } = renderApp(<EditProfileScreen />);
    const email = await findByTestId('profile-edit-email-input', {}, WAIT);
    expect(email.props.value).toBe('ana@example.com');
    expect(email.props.editable).toBe(false);
  });
});

// ===========================================================================
// Failures are read by `code`, never by status.
// ===========================================================================
describe('a failed save', () => {
  it('points a signed-out save at the sign-in sentence', async () => {
    mockUpdateMyProfile.mockRejectedValue(new ApiError({ status: 401, code: 'UNAUTHENTICATED' }));

    const { findByTestId, getByTestId, findByText } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-name-input', {}, WAIT), 'ნინო');
    fireEvent.press(getByTestId('profile-edit-save'));

    await findByText('Please sign in', {}, WAIT);
  });

  it('uses one sentence for everything else, and keeps the draft', async () => {
    mockUpdateMyProfile.mockRejectedValue(new ApiError({ status: 500, code: 'INTERNAL_ERROR' }));

    const { findByTestId, getByTestId, findByText } = renderApp(<EditProfileScreen />);
    fireEvent.changeText(await findByTestId('profile-edit-name-input', {}, WAIT), 'ნინო');
    fireEvent.press(getByTestId('profile-edit-save'));

    await findByText("Couldn't save, try again", {}, WAIT);
    // The retry IS the button they just pressed, so the typing must survive.
    expect(getByTestId('profile-edit-name-input').props.value).toBe('ნინო');
  });
});

// ===========================================================================
// Both locales, no English baked in. §6 item 6.
// ===========================================================================
describe('copy', () => {
  it('renders Georgian, and it is not the English string', async () => {
    const en = renderApp(<EditProfileScreen />, { locale: 'en' });
    const enLabel = (await en.findByTestId('profile-edit-name-input', {}, WAIT)).props
      .accessibilityLabel as string;

    const ka = renderApp(<EditProfileScreen />, { locale: 'ka' });
    const kaLabel = (await ka.findByTestId('profile-edit-name-input', {}, WAIT)).props
      .accessibilityLabel as string;

    expect(enLabel).toBe('Full name');
    expect(kaLabel).toBe('სახელი და გვარი');
  });
});
