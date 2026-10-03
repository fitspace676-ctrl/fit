import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import {
  DEFAULT_PORTAL_ACCENT,
  gymSettingsStoredSchema,
  type GymSettings,
  type JoinCardDefaults,
} from '@fit/types';
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

const COPY: JoinCardDefaults = {
  title: 'First time here?',
  titleNamed: 'Not at {gym} yet?',
  subtitle: 'Pick a branch.',
  benefits: ['Branch'],
  cta: 'Join',
};

const BRAND_RED = '#dc2626';

/** A gym whose BRAND is red, with the given portal colour. */
function renderForm(primaryColor: string | null) {
  const stored = gymSettingsStoredSchema.parse({
    brand: { primaryColor: BRAND_RED },
    memberPortal: { primaryColor },
  });
  const initial: GymSettings = { ...stored, brand: { ...stored.brand, name: 'Downtown' } };
  vi.mocked(updateMemberPortalAction).mockResolvedValue({ ok: true, data: initial });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <MemberPortalForm initial={initial} joinDefaults={{ ka: COPY, en: COPY }} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const hexBox = () => screen.getByLabelText('Primary colour, hex value');

beforeEach(() => vi.mocked(updateMemberPortalAction).mockReset());

describe('the portal colour card', () => {
  // A gym that never chose sees what members and staff actually see: the
  // default sky blue, not its brand colour (which the portal ignores).
  it('shows the default colour, not the brand, until the gym chooses', () => {
    renderForm(null);
    expect(hexBox()).toHaveValue(DEFAULT_PORTAL_ACCENT);
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(
      screen.getByText(`Uses the default FormaCore colour, ${DEFAULT_PORTAL_ACCENT}.`),
    ).toBeInTheDocument();
  });

  it('applies the brand colour in one click, and saves it for both apps', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: `Use the brand colour (${BRAND_RED})` }));
    expect(hexBox()).toHaveValue(BRAND_RED);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    expect(vi.mocked(updateMemberPortalAction).mock.calls[0]![0].primaryColor).toBe(BRAND_RED);
  });

  it('starts a custom colour from the default', () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different colour' }));
    expect(hexBox()).toHaveValue(DEFAULT_PORTAL_ACCENT);
    expect(hexBox()).toBeEnabled();
  });

  it('goes back to the default from a chosen colour', async () => {
    renderForm('#7c3aed');
    expect(hexBox()).toHaveValue('#7c3aed');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the default colour' }));
    expect(hexBox()).toHaveValue(DEFAULT_PORTAL_ACCENT);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateMemberPortalAction).toHaveBeenCalled());
    expect(vi.mocked(updateMemberPortalAction).mock.calls[0]![0].primaryColor).toBeNull();
  });
});
