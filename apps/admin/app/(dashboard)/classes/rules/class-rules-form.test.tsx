import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { ClassRules } from '@fit/types';
import { ToastProvider } from '@/components/ui';
import { ClassRulesForm } from './class-rules-form';
import { updateClassRulesAction } from './actions';

vi.mock('./actions', () => ({ updateClassRulesAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const values = {
  booking: { cancellationCutoffHours: 6 },
  noShow: { strikeLimit: 3, strikeWindowDays: 30, blockDays: 7 },
};
function setup() {
  const initial: ClassRules = values;
  vi.mocked(updateClassRulesAction).mockResolvedValue({ ok: true, data: initial });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <ClassRulesForm initial={initial} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}
const field = (key: 'cutoff' | 'limit' | 'window' | 'duration') =>
  screen.getByRole('spinbutton', { name: new RegExp(en.admin.classRules[`${key}Label`]) });
const save = () =>
  fireEvent.click(screen.getByRole('button', { name: en.admin.settings.saveBar.save }));
beforeEach(() => vi.mocked(updateClassRulesAction).mockReset());
describe('Class rules form', () => {
  it('renders the loaded values', () => {
    setup();
    expect(field('cutoff')).toHaveValue(6);
    expect(field('limit')).toHaveValue(3);
    expect(field('window')).toHaveValue(30);
    expect(field('duration')).toHaveValue(7);
  });
  it('shows an inline error and blocks a partially enabled rule', async () => {
    setup();
    fireEvent.change(field('window'), { target: { value: '0' } });
    save();
    expect(await screen.findByText(en.admin.classRules.requiredTogether)).toBeInTheDocument();
    expect(updateClassRulesAction).not.toHaveBeenCalled();
  });
  it('submits exactly the four editable fields', async () => {
    setup();
    fireEvent.change(field('cutoff'), { target: { value: '12' } });
    save();
    await waitFor(() => expect(updateClassRulesAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(updateClassRulesAction).mock.calls[0]![0]).toEqual({
      ...values,
      booking: { cancellationCutoffHours: 12 },
    });
  });
});
