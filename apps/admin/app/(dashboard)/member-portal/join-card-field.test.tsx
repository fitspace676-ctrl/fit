import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { gymSettingsStoredSchema, type GymSettings, type JoinCardDefaults } from '@fit/types';
import { ToastProvider } from '@/components/ui';
import { MemberPortalForm } from './member-portal-form';
import { updateMemberPortalAction } from './actions';

vi.mock('./actions', () => ({
  updateMemberPortalAction: vi.fn(),
  requestPortalImageUploadAction: vi.fn(),
  finalizePortalImageAction: vi.fn(),
  requestPortalLogoUploadAction: vi.fn(),
  finalizePortalLogoAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const DEFAULTS: Record<'ka' | 'en', JoinCardDefaults> = {
  ka: {
    title: 'პირველად ხარ აქ?',
    titleNamed: 'ჯერ არ ხარ {gym}-ში?',
    subtitle: 'აირჩიე ფილიალი.',
    benefits: ['ფილიალი', 'პაკეტი', 'მყისიერად'],
    cta: 'გახდი წევრი',
  },
  en: {
    title: 'First time here?',
    titleNamed: 'Not at {gym} yet?',
    subtitle: 'Pick a branch.',
    benefits: ['Branch', 'Plan', 'Instant'],
    cta: 'Become a member',
  },
};

/** A gym's settings as the API returns them, with only the portal block varied. */
function settings(memberPortal: Record<string, unknown> = {}): GymSettings {
  const stored = gymSettingsStoredSchema.parse({ memberPortal });
  return { ...stored, brand: { ...stored.brand, name: 'Downtown' } };
}

function renderForm(initial = settings()) {
  vi.mocked(updateMemberPortalAction).mockResolvedValue({ ok: true, data: initial });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <MemberPortalForm initial={initial} joinDefaults={DEFAULTS} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The control labelled `label` in the language tab currently shown. */
function field(label: string): HTMLElement {
  const shown = screen.getAllByLabelText(label).find((el) => !el.closest('[hidden]'));
  if (!shown) {
    throw new Error(`No visible field labelled ${label}`);
  }
  return shown;
}

/** The button named `name` in the language tab currently shown. */
function button(name: string): HTMLElement {
  const shown = screen.getAllByRole('button', { name }).find((el) => !el.closest('[hidden]'));
  if (!shown) {
    throw new Error(`No visible button named ${name}`);
  }
  return shown;
}

function save() {
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
}

beforeEach(() => vi.mocked(updateMemberPortalAction).mockReset());

describe('the join card on the member portal screen', () => {
  // Leaving a field empty must visibly mean "keep the built-in text", in the
  // language being edited, not the console's.
  it('shows the built-in copy of the chosen language as placeholders', () => {
    renderForm();
    expect(field('Heading')).toHaveAttribute('placeholder', 'ჯერ არ ხარ {gym}-ში?');
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(field('Heading')).toHaveAttribute('placeholder', 'Not at {gym} yet?');
    expect(field('Button text')).toHaveAttribute('placeholder', 'Become a member');
  });

  it('previews what the gym types, with {gym} filled in', () => {
    renderForm();
    expect(screen.getAllByText('ჯერ არ ხარ Downtown-ში?').length).toBeGreaterThan(0);
    fireEvent.change(field('Heading'), { target: { value: 'მოდი {gym}-ში' } });
    expect(screen.getByText('მოდი Downtown-ში')).toBeInTheDocument();
  });

  it('saves each language separately, empty lines as empty', async () => {
    renderForm();
    fireEvent.change(field('Heading'), { target: { value: 'მოდი' } });
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.click(screen.getByRole('radio', { name: 'ქართული' }));
    // Leaving a tab and coming back keeps what was typed in it.
    expect(field('Heading')).toHaveValue('მოდი');
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    fireEvent.change(field('Button text'), { target: { value: 'Join now' } });
    save();
    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    const { joinCard } = vi.mocked(updateMemberPortalAction).mock.calls[0]![0];
    expect(joinCard).toEqual({
      hidden: false,
      ka: { title: 'მოდი', subtitle: '', benefits: null, cta: '' },
      en: { title: '', subtitle: '', benefits: null, cta: 'Join now' },
    });
  });

  // The list follows the built-in one until the gym asks to edit it; a blank
  // row is dropped on save rather than stored as an empty tick.
  it('copies the built-in list into editable rows, and drops blank rows on save', async () => {
    renderForm();
    fireEvent.click(button('Edit the list'));
    fireEvent.change(field('Benefit 1'), { target: { value: 'უფასო ვარჯიში' } });
    fireEvent.click(button('Remove benefit 3'));
    fireEvent.click(button('Add a benefit'));
    save();
    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    expect(vi.mocked(updateMemberPortalAction).mock.calls[0]![0].joinCard?.ka?.benefits).toEqual([
      'უფასო ვარჯიში',
      'პაკეტი',
    ]);
  });

  it('hides the card, and the preview says so', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('switch', { name: /Show on the sign-in screen/ }));
    expect(screen.getByText('The join card is hidden.')).toBeInTheDocument();
    save();
    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    expect(vi.mocked(updateMemberPortalAction).mock.calls[0]![0].joinCard?.hidden).toBe(true);
  });

  it('loads what the gym saved before', () => {
    renderForm(settings({ joinCard: { en: { cta: 'Join' }, ka: { benefits: [] } } }));
    expect(screen.getByText('No benefits: the block shows without a list.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'English' }));
    expect(field('Button text')).toHaveValue('Join');
  });
});
