import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { chooseOption } from '@fit/ui-kit/testing';
import { en } from '@fit/i18n';
import { ServiceForm } from './service-form';
import { createServiceAction } from './actions';

/** Render inside the console's English catalogue, as the dashboard layout does. */
function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

vi.mock('./actions', () => ({
  createServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: { id: 's-1' } })),
  updateServiceAction: vi.fn(() => Promise.resolve({ ok: true, data: undefined })),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const staff = [
  { id: 'gm-1', name: 'Nino Beridze', role: 'TRAINER', photoUrl: null, isTrainer: true },
  { id: 'gm-2', name: 'Lasha M', role: 'RECEPTIONIST', photoUrl: null, isTrainer: false },
];
const categories = [
  { id: 'cat-1', name: 'Boxing', serviceCount: 0 },
  { id: 'cat-2', name: 'Pilates', serviceCount: 2 },
];

describe('ServiceForm', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows no name field and only trainers for a personal-training service', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Name')).toBeNull();
    await user.click(screen.getByLabelText('Staff member'));
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Nino Beridze');
    expect(options).not.toContain('Lasha M');
  });

  it('offers a cover image and no schedule section on a personal-training service', () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Upload cover image' })).toBeTruthy();
    // The recurrence section was removed on 2026-09-02: slots come from the PT calendar.
    expect(screen.queryByRole('radio', { name: 'Weekly' })).toBeNull();
    expect(screen.queryByLabelText('Starts on')).toBeNull();
  });

  it('sends the profile alone for a personal-training service', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    await chooseOption(user, screen.getByLabelText('Staff member'), 'Nino Beridze');
    fireEvent.change(screen.getByLabelText('Price per session'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(createServiceAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createServiceAction).mock.calls[0]!;
    expect(input).toMatchObject({ type: 'PERSONAL_TRAINING', coverUrl: null, categoryId: null });
    expect('schedule' in (input as object)).toBe(false);
  });

  it('shows the name and every staff member for a custom service', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="CUSTOM"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText('Name')).toBeTruthy();
    await user.click(screen.getByLabelText('Staff member'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Lasha M');
  });

  it('creates a custom service from its name and profile', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="CUSTOM"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Massage' } });
    await chooseOption(user, screen.getByLabelText('Staff member'), 'Nino Beridze');
    fireEvent.change(screen.getByLabelText('Price per session'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(createServiceAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createServiceAction).mock.calls.at(-1)!;
    expect(input).toMatchObject({ type: 'CUSTOM', name: 'Massage', staffId: 'gm-1' });
  });

  it("files a personal session under one of the gym's categories", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        categories={categories}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    const picker = screen.getByLabelText('Category (optional)');
    await user.click(picker);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'No category',
      'Boxing',
      'Pilates',
    ]);
    await user.keyboard('{Escape}');
    await chooseOption(user, picker, 'Boxing');
    await chooseOption(user, screen.getByLabelText('Staff member'), 'Nino Beridze');
    fireEvent.change(screen.getByLabelText('Price per session'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(createServiceAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createServiceAction).mock.calls.at(-1)!;
    expect(input).toMatchObject({ type: 'PERSONAL_TRAINING', categoryId: 'cat-1' });
  });
});
