import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { InviteModal } from './invite-modal';
import { inviteStaffAction } from './actions';
vi.mock('./actions', () => ({ inviteStaffAction: vi.fn() }));

function show() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider initial="light">
        <InviteModal
          open
          onClose={() => {}}
          canAssignOwner={false}
          locations={[
            { id: 'loc-1', name: 'Saburtalo' },
            { id: 'loc-2', name: 'Vake' },
          ]}
        />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}
describe('staff invite details', () => {
  beforeEach(() => {
    vi.mocked(inviteStaffAction).mockReset();
  });
  it('requires names and a branch before submission', async () => {
    show();
    fireEvent.submit(document.querySelector('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      en.admin.staff.inviteModal.requiredDetails,
    );
    expect(inviteStaffAction).not.toHaveBeenCalled();
  });
  it('submits the entered identity and selected branches', async () => {
    vi.mocked(inviteStaffAction).mockResolvedValue({ ok: true, data: { inviteId: 'invite-1' } });
    show();
    fireEvent.change(
      screen.getByRole('textbox', { name: en.admin.staff.addStaffDrawer.firstName }),
      { target: { value: 'Nino' } },
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: en.admin.staff.addStaffDrawer.lastName }),
      { target: { value: 'Beridze' } },
    );
    fireEvent.change(screen.getByRole('textbox', { name: en.admin.staff.inviteModal.emailLabel }), {
      target: { value: 'nino@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Saburtalo' }));
    fireEvent.click(screen.getByRole('button', { name: en.admin.staff.roles.RECEPTIONIST }));
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() =>
      expect(inviteStaffAction).toHaveBeenCalledWith({
        email: 'nino@example.com',
        firstName: 'Nino',
        lastName: 'Beridze',
        role: 'RECEPTIONIST',
        locationIds: ['loc-1'],
      }),
    );
  });
});
