import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
    completedAt: null,
    values: {
      business: { gymName: 'Studio', address: null, phone: null, email: null, website: null },
      locale: { language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' },
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
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['ONBOARDING_LINK_INVALID', 404, 'This setup link is invalid.'],
    ['ONBOARDING_LINK_EXPIRED', 410, 'This setup link has expired.'],
  ])('shows a dead end for %s', async (code, status, copy) => {
    fetchMock.mockResolvedValue(response({ code }, Number(status)));
    renderWizard();
    expect(await screen.findByText(new RegExp(String(copy)))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('opens completed links on the sign-in screen', async () => {
    fetchMock.mockResolvedValue(response(initial({ status: 'COMPLETED' })));
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
    expect(screen.getByRole('button', { name: 'Your account · Done' })).toBeDisabled();
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
    await screen.findByLabelText('Currency');
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(next.values.business);
  });

  it('skips optional steps without writes, reviews saved values and finishes at sign-in', async () => {
    const user = userEvent.setup();
    const next = initial({
      completedSteps: ['account'],
      owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
    });
    fetchMock
      .mockResolvedValueOnce(response(next))
      .mockResolvedValueOnce(response({ email: next.owner.email }));
    renderWizard();
    await screen.findByLabelText('Gym name');
    await user.clear(screen.getByLabelText('Gym name'));
    await user.type(screen.getByLabelText('Gym name'), 'Unsaved name');
    for (let i = 0; i < 5; i++)
      await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByText('Unsaved name')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() =>
      expect(navigationMock.replace).toHaveBeenCalledWith(
        '/login?email=owner%40example.com&activated=1',
      ),
    );
    expect(fetchMock.mock.calls[1]?.[0]).toMatch(/\/gym-onboarding\/live-token\/complete$/);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('POST');
  });

  it('refreshes after another device sets the account password', async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(response(initial()))
      .mockResolvedValueOnce(response({ code: 'ONBOARDING_ACCOUNT_ALREADY_SET' }, 409))
      .mockResolvedValueOnce(
        response(
          initial({
            completedSteps: ['account'],
            owner: { email: 'owner@example.com', name: 'Owner', hasPassword: true },
          }),
        ),
      );
    renderWizard();
    await user.type(await screen.findByLabelText('New password'), 'strong-password');
    await user.type(screen.getByLabelText('Confirm password'), 'strong-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText('Gym name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your account · Done' })).toBeDisabled();
  });

  it('handles a concurrent completion on write', async () => {
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
      .mockResolvedValueOnce(response({ code: 'ONBOARDING_COMPLETED' }, 409));
    renderWizard();
    await screen.findByLabelText('Gym name');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
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
    await screen.findByLabelText('Currency');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Gym name')).toHaveValue('Studio');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
