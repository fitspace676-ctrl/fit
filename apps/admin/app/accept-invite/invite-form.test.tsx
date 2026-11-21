import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { InviteForm } from './invite-form';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('token=test') }));
vi.mock('@/lib/tenant-host', () => ({ browserTenantHeaders: () => ({}) }));
const fetchMock = vi.fn();
function show(needsPassword: boolean) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        needsPassword,
        email: 'qa@example.com',
        gymName: 'Downtown',
        forgotPasswordUrl: '/member/forgot-password?email=qa',
      }),
  });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <InviteForm />
    </NextIntlClientProvider>,
  );
}
describe('invite password modes', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  it('requires matching new passwords', async () => {
    show(true);
    const password = await screen.findByLabelText(en.admin.invite.password);
    fireEvent.change(password, { target: { value: 'newpassword' } });
    fireEvent.change(screen.getByLabelText(en.admin.invite.confirm), {
      target: { value: 'different' },
    });
    expect(screen.getByRole('button', { name: en.admin.invite.submit })).toBeDisabled();
    expect(screen.getByText(en.admin.invite.mismatch)).toBeInTheDocument();
  });
  it('asks for the existing password, links reset and allows retry after a wrong password', async () => {
    show(false);
    const password = await screen.findByLabelText(en.admin.invite.currentPassword);
    expect(screen.queryByLabelText(en.admin.invite.confirm)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: en.admin.invite.forgotPassword })).toHaveAttribute(
      'href',
      '/member/forgot-password?email=qa',
    );
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    fireEvent.change(password, { target: { value: 'wrong' } });
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText(en.admin.invite.wrongPassword)).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/accept-invite'),
        expect.objectContaining({
          body: JSON.stringify({ token: 'test', currentPassword: 'wrong' }),
        }),
      ),
    );
    expect(screen.getByLabelText(en.admin.invite.currentPassword)).toBeInTheDocument();
  });
});
