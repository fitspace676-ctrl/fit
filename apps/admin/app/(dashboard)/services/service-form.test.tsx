import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
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

describe('ServiceForm', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows no name field and only trainers for a personal-training service', () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByLabelText('Name')).toBeNull();
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Nino Beridze');
    expect(options).not.toContain('Lasha M');
  });

  it('offers a cover image and an optional schedule on a personal-training service', () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Upload cover image' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Weekly' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Starts on').required).toBe(false);
  });

  it('sends no schedule for a personal-training service left without a start date', async () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="PERSONAL_TRAINING"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Staff member'), { target: { value: 'gm-1' } });
    fireEvent.change(screen.getByLabelText('Price per session'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(createServiceAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createServiceAction).mock.calls[0]!;
    expect(input).toMatchObject({ type: 'PERSONAL_TRAINING', schedule: null, coverUrl: null });
  });

  it('shows the name, schedule and every staff member for a custom service', () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="CUSTOM"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Weekly' })).toBeTruthy();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Lasha M');
  });

  it('only shows weekday chips for a weekly schedule', () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="CUSTOM"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Daily' }));
    expect(screen.queryByRole('checkbox', { name: 'Mon' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Weekly' }));
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeTruthy();
  });

  it('clears the end date and weekdays on submit when Weekly is switched to Once', async () => {
    renderWithIntl(
      <ServiceForm
        mode="create"
        type="CUSTOM"
        staff={staff}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Massage' } });
    fireEvent.change(screen.getByLabelText('Staff member'), { target: { value: 'gm-1' } });
    fireEvent.change(screen.getByLabelText('Price per session'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Starts on'), { target: { value: '2026-09-01' } });

    // Still Weekly (the default): pick a weekday and set an end date.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mon' }));
    fireEvent.change(screen.getByLabelText('Until (optional)'), {
      target: { value: '2026-12-01' },
    });

    // Switch to Once — the Until field disappears, but its typed value must
    // not still be sent once it's no longer shown.
    fireEvent.click(screen.getByRole('radio', { name: 'Once' }));
    expect(screen.queryByLabelText('Until (optional)')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create service' }));

    await waitFor(() => expect(createServiceAction).toHaveBeenCalledTimes(1));
    const [input] = vi.mocked(createServiceAction).mock.calls.at(-1)!;
    expect(input).toMatchObject({
      type: 'CUSTOM',
      schedule: { freq: 'ONCE', weekdays: [], until: null },
    });
  });
});
