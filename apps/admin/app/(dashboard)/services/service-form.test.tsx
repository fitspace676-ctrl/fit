import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ServiceForm } from './service-form';

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
  it('shows no name field and only trainers for a personal-training service', () => {
    render(
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

  it('shows the name, schedule and every staff member for a custom service', () => {
    render(
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
    render(
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
});
