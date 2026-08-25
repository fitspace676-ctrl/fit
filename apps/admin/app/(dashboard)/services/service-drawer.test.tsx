import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { ServiceDrawer } from './service-drawer';

/** Render inside the console's English catalogue, as the dashboard layout does. */
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

vi.mock('./actions', () => ({
  fetchServiceStaffAction: vi.fn(() =>
    Promise.resolve({
      ok: true,
      data: [
        { id: 'gm-1', name: 'Nino Beridze', role: 'TRAINER', photoUrl: null, isTrainer: true },
      ],
    }),
  ),
  createServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 's-1' } })),
  updateServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

describe('ServiceDrawer', () => {
  it('resets the type step after closing without Cancel or a successful create', async () => {
    renderWithIntl(<ServiceDrawer mode="create" />);

    // Open the drawer and pick a type — advances past the type step.
    fireEvent.click(screen.getByRole('button', { name: 'New service' }));
    await screen.findByText('Personal training');
    fireEvent.click(screen.getByText('Personal training'));
    await screen.findByLabelText('Staff member');

    // Close it a way that is neither the form's Cancel nor a successful
    // create — Escape, routed through the dialog's own keydown handler.
    const dialogEl = document.querySelector('dialog');
    expect(dialogEl).not.toBeNull();
    fireEvent.keyDown(dialogEl!, { key: 'Escape' });

    // The slide-out drawer stays "open" through its exit animation, then
    // actually closes — wait for that to land.
    await waitFor(() => expect(dialogEl!.hasAttribute('open')).toBe(false), { timeout: 1000 });

    // Reopening must show the type step again, not jump straight to the form.
    fireEvent.click(screen.getByRole('button', { name: 'New service' }));
    await waitFor(() => expect(screen.getByText('Personal training')).toBeTruthy());
    expect(screen.queryByLabelText('Staff member')).toBeNull();
  });
});
