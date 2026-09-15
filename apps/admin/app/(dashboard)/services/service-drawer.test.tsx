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
  fetchServiceCategoriesAction: vi.fn(() =>
    Promise.resolve({ ok: true, data: [{ id: 'cat-1', name: 'Boxing', serviceCount: 1 }] }),
  ),
  createServiceCategoryAction: vi.fn((input: { name: string }) =>
    Promise.resolve({ ok: true, data: { id: 'cat-2', name: input.name, serviceCount: 0 } }),
  ),
  deleteServiceCategoryAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
  createServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 's-1' } })),
  updateServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));
const { createServiceCategoryAction } = await import('./actions');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

describe('ServiceDrawer', () => {
  it('resets the type step after closing without Cancel or a successful create', async () => {
    renderWithIntl(<ServiceDrawer mode="create" />);

    // Open the drawer and pick a type — advances past the type step.
    fireEvent.click(screen.getByRole('button', { name: 'New service' }));
    await screen.findByText('Personal session');
    fireEvent.click(screen.getByText('Personal session'));
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
    await waitFor(() => expect(screen.getByText('Personal session')).toBeTruthy());
    expect(screen.queryByLabelText('Staff member')).toBeNull();
  });

  it('offers "Create category" in place of a custom service, and adds one from the panel', async () => {
    renderWithIntl(<ServiceDrawer mode="create" />);

    fireEvent.click(screen.getByRole('button', { name: 'New service' }));
    await screen.findByText('Create category');
    expect(screen.queryByText('Custom service')).toBeNull();

    fireEvent.click(screen.getByText('Create category'));
    // The gym's existing category is listed with how many services it files.
    expect(await screen.findByText('Boxing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Boxing' }).hasAttribute('disabled')).toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText('Category name'), { target: { value: 'Pilates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));

    await waitFor(() =>
      expect(createServiceCategoryAction).toHaveBeenCalledWith({ name: 'Pilates' }),
    );
    // The new category joins the list at once, ready for the session form's picker.
    expect(await screen.findByText('Pilates')).toBeTruthy();
  });
});
