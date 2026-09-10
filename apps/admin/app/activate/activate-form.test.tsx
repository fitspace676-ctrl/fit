// @fit/admin — the gym owner's activation form.
//
// What is pinned here is the contract the rest of the onboarding flow rests on:
// ONE request carrying the link's token and the chosen password, and a hand-off
// to the sign-in page rather than into the console. The "no session" half of that
// is deliberate (see `activate-form.tsx`), so it is worth a test that would fail
// loudly if someone later "helpfully" logged the owner straight in.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { navigationMock } from '@/test/next-navigation-mock';
import { ActivateForm } from './activate-form';

vi.mock('next/navigation', () => navigationMock.factory());

const messages = {
  admin: {
    activate: {
      passwordLabel: 'New password',
      confirmLabel: 'Confirm password',
      submit: 'Set password',
      submitting: 'Setting password…',
      mismatch: 'The two passwords do not match.',
      tooShort: 'Use at least {min} characters.',
      missingToken: 'This activation link is incomplete.',
      invalidToken: 'This activation link is invalid or has expired.',
    },
  },
  auth: {
    fields: { passwordPlaceholder: '••••••••', passwordHint: 'At least 8 characters.' },
    showPassword: 'Show',
    hidePassword: 'Hide',
    genericError: 'Something went wrong. Please try again.',
  },
};

function renderForm(): void {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActivateForm />
    </NextIntlClientProvider>,
  );
}

/** Fill both password fields and submit. */
async function submit(password: string, confirm = password): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Set password' }));
}

describe('ActivateForm', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigationMock.reset();
    navigationMock.setSearch('token=onboard-tok');
    fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ email: 'owner@example.com' }), { status: 200 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the token and password, then sends the owner to sign in with the address pre-filled', async () => {
    renderForm();

    await submit('brand-new-secret');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/activate$/);
    expect(JSON.parse(init.body as string)).toEqual({
      token: 'onboard-tok',
      password: 'brand-new-secret',
    });

    // The hand-off: sign-in, address filled, confirmation flag — NOT the console.
    expect(navigationMock.replace).toHaveBeenCalledWith(
      '/login?email=owner%40example.com&activated=1',
    );
  });

  it('refuses a mismatched confirmation without spending the single-use token', async () => {
    renderForm();

    await submit('brand-new-secret', 'brand-new-secrit');

    expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it('refuses a password under the policy length without spending the token', async () => {
    renderForm();

    await submit('short');

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an expired link by its code, and stays put', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'TOKEN_INVALID_OR_EXPIRED', message: 'nope' }), {
        status: 400,
      }),
    );
    renderForm();

    await submit('brand-new-secret');

    expect(
      await screen.findByText('This activation link is invalid or has expired.'),
    ).toBeInTheDocument();
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it('draws no form at all when the link carries no token', () => {
    navigationMock.setSearch('');
    renderForm();

    expect(screen.getByText('This activation link is incomplete.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
