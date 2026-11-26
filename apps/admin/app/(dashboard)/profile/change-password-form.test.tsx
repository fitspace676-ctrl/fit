import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ChangePasswordForm } from './change-password-form';
import { changePasswordAction } from './actions';
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/components/ui', () => ({ useToast: () => ({ toast }) }));
vi.mock('./actions', () => ({ changePasswordAction: vi.fn() }));
const copy = en.admin.profile.password;
function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ChangePasswordForm />
    </NextIntlClientProvider>,
  );
}
function fill(confirm = 'newpassword') {
  fireEvent.change(screen.getByLabelText(copy.current), { target: { value: 'oldpassword' } });
  fireEvent.change(screen.getByLabelText(copy.new), { target: { value: 'newpassword' } });
  fireEvent.change(screen.getByLabelText(copy.confirm), { target: { value: confirm } });
}
describe('profile password form', () => {
  beforeEach(() => {
    vi.mocked(changePasswordAction).mockReset();
    toast.mockReset();
  });
  it('prevents mismatched confirmation', () => {
    show();
    fill('different');
    fireEvent.submit(document.querySelector('form')!);
    expect(changePasswordAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: copy.submit })).toBeDisabled();
  });
  it('displays server errors inline', async () => {
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: false, error: 'wrongPassword' });
    show();
    fill();
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByText(copy.wrongPassword)).toBeInTheDocument();
  });
  it('clears passwords and toasts after success', async () => {
    vi.mocked(changePasswordAction).mockResolvedValue({ ok: true });
    show();
    fill();
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(copy.success, { tone: 'success', icon: 'check' }),
    );
    expect(changePasswordAction).toHaveBeenCalledWith({
      currentPassword: 'oldpassword',
      password: 'newpassword',
    });
    expect(screen.getByLabelText(copy.current)).toHaveValue('');
  });
});
