import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  finalizePortalFaviconAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const COPY: JoinCardDefaults = {
  title: 'First time here?',
  titleNamed: 'Not at {gym} yet?',
  subtitle: 'Pick a branch.',
  benefits: ['Branch'],
  cta: 'Join',
};

function settings(memberTerms: Record<string, unknown> = {}): GymSettings {
  const stored = gymSettingsStoredSchema.parse({ memberTerms });
  return { ...stored, brand: { ...stored.brand, name: 'Downtown' } };
}

function renderForm(initial = settings()) {
  vi.mocked(updateMemberPortalAction).mockResolvedValue({ ok: true, data: initial });
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <MemberPortalForm initial={initial} joinDefaults={{ ka: COPY, en: COPY }} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The terms textarea of the language tab currently shown. */
function termsField(): HTMLElement {
  const shown = screen.getAllByLabelText('Terms text').find((el) => !el.closest('[hidden]'));
  if (!shown) throw new Error('No visible terms field');
  return shown;
}

const termsLanguages = () => within(screen.getByRole('radiogroup', { name: 'Terms language' }));

beforeEach(() => vi.mocked(updateMemberPortalAction).mockReset());

describe('the member terms on the member portal screen', () => {
  it('loads the saved terms of each language', () => {
    renderForm(settings({ ka: 'წესები', en: 'Rules' }));
    expect(termsField()).toHaveValue('წესები');
    fireEvent.click(termsLanguages().getByRole('radio', { name: 'English' }));
    expect(termsField()).toHaveValue('Rules');
  });

  it('saves both languages with the portal look, in the same request', async () => {
    renderForm();
    fireEvent.change(termsField(), { target: { value: 'გაუქმება 14 დღით ადრე' } });
    fireEvent.click(termsLanguages().getByRole('radio', { name: 'English' }));
    fireEvent.change(termsField(), { target: { value: 'Cancel 14 days ahead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    const [portal, terms] = vi.mocked(updateMemberPortalAction).mock.calls[0]!;
    expect(portal).not.toHaveProperty('memberTerms');
    expect(terms).toEqual({ ka: 'გაუქმება 14 დღით ადრე', en: 'Cancel 14 days ahead' });
  });
});
