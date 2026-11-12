import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { GYM_ONBOARDING_STEPS, WEEKDAYS, type GymOnboardingState } from '@fit/types';
import messages from '@fit/i18n/locales/en.json';
import { navigationMock } from '@/test/next-navigation-mock';
import { OnboardingWizard } from './onboarding-wizard';

vi.mock('next/navigation', () => navigationMock.factory());

function initial(overrides: Partial<GymOnboardingState> = {}): GymOnboardingState {
  return {
    status: 'PENDING',
    gym: { name: 'Studio', subdomainSlug: 'studio' },
    owner: { email: 'owner@example.com', name: 'Owner', hasPassword: false },
    steps: [...GYM_ONBOARDING_STEPS],
    completedSteps: [],
    expiresAt: '2099-01-01T00:00:00.000Z',
    codeSentAt: null,
    codeResendAvailableAt: null,
    submittedAt: null,
    values: {
      business: { gymName: 'Studio', address: null, phone: null, email: null, website: null },
      brand: { primaryColor: '#336699' },
      location: {
        name: 'Studio',
        address: '',
        phone: null,
        hours: Object.fromEntries(
          WEEKDAYS.map((day) => [day, { closed: false, open: '09:00', close: '18:00' }]),
        ) as GymOnboardingState['values']['location']['hours'],
      },
      payments: {
        acceptCash: true,
        acceptCard: true,
        acceptBankTransfer: false,
        acceptPrepaidCredits: false,
      },
    },
    ...overrides,
  };
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}
function renderWizard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnboardingWizard token="live-token" />
    </NextIntlClientProvider>,
  );
}

describe('OnboardingWizard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    navigationMock.reset();
    fetchMock = vi.fn().mockResolvedValue(response(initial()));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ['ONBOARDING_LINK_INVALID', 404, 'This setup link is invalid.'],
    ['ONBOARDING_LINK_EXPIRED', 410, 'This setup link has expired.'],
  ])('shows a dead end for %s', async (code, status, copy) => {
    fetchMock.mockResolvedValue(response({ code }, Number(status)));
    renderWizard();
    expect(await screen.findByText(new RegExp(String(copy)))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('opens approved links on the sign-in screen', async () => {
    fetchMock.mockResolvedValue(response(initial({ status: 'APPROVED' })));
    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(navigationMock.replace).toHaveBeenCalledWith('/login?email=owner%40example.com');
  });

  it('checks password length and confirmation without writing', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.type(await screen.findByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), '-long-enough');
    await user.type(screen.getByLabelText('Confirm password'), 'different-secret');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('saves the account with tenant headers and replaces local values with the API response', async () => {
    const user = userEvent.setup();
    const next = initial({
      completedSteps: ['account'],
      owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
    });
    next.values.business.gymName = 'Live name';
    fetchMock.mockResolvedValueOnce(response(initial())).mockResolvedValueOnce(response(next));
    renderWizard();
    await user.type(await screen.findByLabelText('New password'), 'strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'strong-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Live name');
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/gym-onboarding\/live-token\/steps\/account$/);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['x-tenant-host']).toBe(window.location.host);
    expect(JSON.parse(init.body as string)).toEqual({
      ownerName: 'Owner',
      password: 'strong-password',
    });
    expect(screen.getByRole('button', { name: 'Your account · Done' })).toBeEnabled();
  });

  it('resumes at the first incomplete step and sends empty optional fields as null', async () => {
    const user = userEvent.setup();
    const next = initial({
      completedSteps: ['account'],
      owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
    });
    fetchMock
      .mockResolvedValueOnce(response(next))
      .mockResolvedValueOnce(response({ ...next, completedSteps: ['account', 'business'] }));
    renderWizard();
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'Brand' });
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(next.values.business);
  });

  it('skips optional steps, reviews saved drafts and sends a confirmation code', async () => {
    const user = userEvent.setup();
    const next = initial({
      completedSteps: ['account'],
      owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
    });
    fetchMock
      .mockResolvedValueOnce(response(next))
      .mockResolvedValueOnce(response({ ...next, status: 'CODE_SENT' }));
    renderWizard();
    await user.type(await screen.findByLabelText('Gym name'), 'Unsaved name');
    for (let i = 0; i < 4; i++)
      await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByText('Unsaved name')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Send confirmation code' }));
    expect(await screen.findByLabelText('Confirmation code')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/live-token\/submit$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'x-tenant-host': window.location.host },
    });
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it.each(['SUBMITTED', 'APPROVED', 'REJECTED'] as const)(
    'refreshes a concurrent submission on write to %s',
    async (status) => {
      const user = userEvent.setup();
      fetchMock
        .mockResolvedValueOnce(response(initial({ completedSteps: ['account'] })))
        .mockResolvedValueOnce(response({ code: 'ONBOARDING_SUBMITTED' }, 409))
        .mockResolvedValueOnce(response(initial({ status })));
      renderWizard();
      await screen.findByLabelText('Gym name');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      const copy =
        status === 'SUBMITTED'
          ? 'Request sent'
          : status === 'APPROVED'
            ? 'Your gym is ready'
            : 'This request was not approved. Contact the platform administrator.';
      expect(await screen.findByText(copy)).toBeInTheDocument();
      expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
        headers: { 'x-tenant-host': window.location.host },
        cache: 'no-store',
      });
      expect(screen.queryByLabelText('Gym name')).not.toBeInTheDocument();
    },
  );

  it('reopens the account with empty passwords and continues without a write', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response(
        initial({
          completedSteps: ['account'],
          owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
        }),
      ),
    );
    renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Your account · Done' }));
    expect(screen.getByLabelText('New password')).toHaveValue('');
    expect(screen.getByLabelText('Confirm password')).toHaveValue('');
    expect(screen.getByLabelText('Owner email')).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Gym name')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('can save a new password from the reopened account step', async () => {
    const user = userEvent.setup();
    const saved = initial({
      completedSteps: ['account'],
      owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
    });
    fetchMock.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response(saved));
    renderWizard();
    await user.click(await screen.findByRole('button', { name: 'Your account · Done' }));
    await user.type(screen.getByLabelText('New password'), 'changed-password');
    await user.type(screen.getByLabelText('Confirm password'), 'changed-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Gym name');
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual({
      ownerName: 'Owner',
      password: 'changed-password',
    });
  });

  it.each([
    ['ONBOARDING_CODE_INVALID', 'That code is not right'],
    ['ONBOARDING_CODE_EXPIRED', 'That code has expired — send a new one'],
  ])('shows %s and preserves the code screen', async (code, copy) => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(initial({ status: 'CODE_SENT' })))
      .mockResolvedValueOnce(response({ code }, 400));
    renderWizard();
    await user.type(await screen.findByLabelText('Confirmation code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation code')).toBeEnabled();
  });

  it('validates six digits locally then verifies and shows the request sent screen', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(initial({ status: 'CODE_SENT' })))
      .mockResolvedValueOnce(response(initial({ status: 'SUBMITTED' })));
    renderWizard();
    const input = await screen.findByLabelText('Confirmation code');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(input, 'abc123');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Enter the 6-digit code.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.clear(input);
    await user.type(input, '012345');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    expect(screen.getByText(/You will get an email at owner@example.com/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/live-token\/verify$/);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ code: '012345' }),
      headers: { 'x-tenant-host': window.location.host },
    });
    expect(screen.queryByLabelText('Confirmation code')).not.toBeInTheDocument();
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it('ticks the resend cooldown and enables a new code when it elapses', async () => {
    vi.useFakeTimers();
    const available = new Date(Date.now() + 3000).toISOString();
    fetchMock
      .mockResolvedValueOnce(
        response(initial({ status: 'CODE_SENT', codeResendAvailableAt: available })),
      )
      .mockResolvedValueOnce(
        response(
          initial({
            status: 'CODE_SENT',
            codeResendAvailableAt: new Date(Date.now() + 60000).toISOString(),
          }),
        ),
      );
    await act(async () => {
      renderWizard();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: 'Send a new code in 3s' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByRole('button', { name: 'Send a new code in 2s' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
    // `fireEvent`, not user-event: under fake timers user-event's own delays never
    // elapse, and this click needs nothing a real pointer sequence would add.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/live-token\/submit$/);
    expect(screen.getByRole('button', { name: /Send a new code in/ })).toBeDisabled();
  });

  it('shows the server cooldown error on resend', async () => {
    fetchMock
      .mockResolvedValueOnce(response(initial({ status: 'CODE_SENT' })))
      .mockResolvedValueOnce(response({ code: 'ONBOARDING_CODE_COOLDOWN' }, 429));
    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(
      await screen.findByText('Wait a moment before asking for another code'),
    ).toBeInTheDocument();
  });

  it('returns to account when submission requires it', async () => {
    fetchMock
      .mockResolvedValueOnce(response(initial({ completedSteps: [...GYM_ONBOARDING_STEPS] })))
      .mockResolvedValueOnce(response({ code: 'ONBOARDING_ACCOUNT_REQUIRED' }, 400));
    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: 'Send confirmation code' }));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it.each([
    ['SUBMITTED', 'Request sent'],
    ['REJECTED', 'This request was not approved. Contact the platform administrator.'],
  ] as const)('loads %s without a form', async (status, copy) => {
    fetchMock.mockResolvedValueOnce(response(initial({ status })));
    renderWizard();
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('returns from a pending code to editable details', async () => {
    fetchMock.mockResolvedValueOnce(response(initial({ status: 'CODE_SENT' })));
    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: 'Back to details' }));
    expect(await screen.findByRole('heading', { name: 'Review' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Your account' }));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });

  it('validates business fields before saving and preserves edits after an API error', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(
        response(
          initial({
            completedSteps: ['account'],
            owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
          }),
        ),
      )
      .mockResolvedValueOnce(response({ message: 'Please try again later.' }, 503));
    renderWizard();
    const name = await screen.findByLabelText('Gym name');
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.type(name, 'Updated studio');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Please try again later.')).toBeInTheDocument();
    expect(name).toHaveValue('Updated studio');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('lets the owner go back and edit saved optional steps', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response(
        initial({
          completedSteps: ['account', 'business'],
          owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
        }),
      ),
    );
    renderWizard();
    await screen.findByRole('heading', { name: 'Brand' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Studio');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
