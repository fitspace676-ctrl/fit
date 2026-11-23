import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { navigationMock } from '@/test/next-navigation-mock';
import { StaffLoginForm } from '../login/staff-login-form';
import { ForgotPasswordForm } from '../forgot-password/forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

vi.mock('next/navigation', () => navigationMock.factory());
vi.mock('../login/login-gym-slug', () => ({ loginGymSlug: () => 'downtown' }));

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function show(form: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {form}
    </NextIntlClientProvider>,
  );
}

function submit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(document.querySelector('form')!);
}

beforeEach(() => {
  navigationMock.reset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('staff account doors', () => {
  it('signs in as staff and keeps the recovery link in the console', async () => {
    fetchMock.mockResolvedValue(reply({ message: 'Rejected' }, 401));
    show(<StaffLoginForm />);
    expect(screen.getByRole('link', { name: en.auth.login.forgotPassword })).toHaveAttribute(
      'href',
      '/admin/forgot-password',
    );
    fireEvent.change(screen.getByLabelText(en.auth.fields.email), {
      target: { value: 'same@example.com' },
    });
    submit(en.auth.fields.password, 'staff-password');
    await screen.findByText('Rejected');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      email: 'same@example.com',
      password: 'staff-password',
      gymSlug: 'downtown',
      audience: 'staff',
    });
  });

  it('requests a reset for staff in this gym and shows the generic localized confirmation', async () => {
    fetchMock.mockResolvedValue(reply({ message: 'generic API message' }));
    show(<ForgotPasswordForm />);
    submit(en.auth.fields.email, 'same@example.com');
    await screen.findByText(en.auth.forgot.sent);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/auth\/forgot-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      email: 'same@example.com',
      gymSlug: 'downtown',
      audience: 'staff',
    });
  });

  it('keeps a failed reset request retryable', async () => {
    fetchMock.mockResolvedValue(reply({}, 500));
    show(<ForgotPasswordForm />);
    submit(en.auth.fields.email, 'same@example.com');
    await screen.findByText(en.auth.genericError);
    expect(screen.getByRole('button', { name: en.auth.forgot.submit })).toBeEnabled();
  });

  it('does not submit an incomplete reset link', () => {
    show(<ResetPasswordForm />);
    expect(screen.getByText(en.auth.reset.missingToken)).toBeInTheDocument();
    expect(screen.queryByLabelText(en.auth.fields.password)).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores an issued staff session in the console and opens its dashboard', async () => {
    navigationMock.setSearch('token=reset-token');
    fetchMock.mockResolvedValueOnce(
      reply({ sessionIssued: true, accessToken: 'a', refreshToken: 'r' }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    show(<ResetPasswordForm />);
    submit(en.auth.fields.password, 'new-password');
    await waitFor(() => expect(navigationMock.replace).toHaveBeenCalledWith('/dashboard'));
    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/auth\/reset-password$/);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      token: 'reset-token',
      password: 'new-password',
    });
    expect(fetchMock.mock.calls[1]![0]).toBe('/admin/api/session');
    expect(JSON.parse(fetchMock.mock.calls[1]![1].body as string)).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
    });
  });

  it('returns to staff login with confirmation when no session is issued', async () => {
    navigationMock.setSearch('token=reset-token');
    fetchMock.mockResolvedValueOnce(reply({ sessionIssued: false, ok: true }));
    show(<ResetPasswordForm />);
    submit(en.auth.fields.password, 'new-password');
    await waitFor(() => expect(navigationMock.replace).toHaveBeenCalledWith('/login?reset=done'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stays on recovery when the token is expired', async () => {
    navigationMock.setSearch('token=expired');
    fetchMock.mockResolvedValue(reply({}, 400));
    show(<ResetPasswordForm />);
    submit(en.auth.fields.password, 'new-password');
    await screen.findByText(en.auth.genericError);
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });
});
