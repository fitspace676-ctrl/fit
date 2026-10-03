import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { DEFAULT_PORTAL_ACCENT, gymSettingsStoredSchema, type GymSettings } from '@fit/types';
import { ToastProvider } from '@/components/ui';
import { SettingsForm } from './settings-form';
import { updateGymSettingsAction } from './actions';

vi.mock('./actions', () => ({
  updateGymSettingsAction: vi.fn(),
  finalizeGymLogoAction: vi.fn(),
  renameLocationAction: vi.fn(),
  requestLogoUploadAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings',
  useSearchParams: () => new URLSearchParams(),
}));

const BRAND_RED = '#dc2626';

/** A gym whose BRAND is red and whose member portal is pink unless given. */
function renderForm(consoleColor: string | null, portalColor: string | null = '#e548c8') {
  const stored = gymSettingsStoredSchema.parse({
    brand: { primaryColor: BRAND_RED },
    memberPortal: { primaryColor: portalColor },
    console: { primaryColor: consoleColor },
  });
  const initial: GymSettings = { ...stored, brand: { ...stored.brand, name: 'Downtown' } };
  vi.mocked(updateGymSettingsAction).mockResolvedValue({ ok: true, data: initial });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ToastProvider>
        <SettingsForm initial={initial} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const hexBox = () => screen.getByLabelText('Console colour, hex value');
const syncBox = () =>
  screen.getByRole('checkbox', { name: 'Use this colour on the member portal too' });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const sent = () => vi.mocked(updateGymSettingsAction).mock.calls[0]![0];

beforeEach(() => vi.mocked(updateGymSettingsAction).mockReset());

describe('the console colour on Settings > General', () => {
  // Its own default, not the member portal's pink and not the brand's red.
  it('shows the default sky blue until the owner chooses', () => {
    renderForm(null);
    expect(hexBox()).toHaveValue(DEFAULT_PORTAL_ACCENT);
    expect(
      screen.getByText(`Uses the default FormaCore colour, ${DEFAULT_PORTAL_ACCENT}.`),
    ).toBeInTheDocument();
  });

  it('applies the brand colour in one click and saves it as the console colour only', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: `Use the brand colour (${BRAND_RED})` }));
    expect(hexBox()).toHaveValue(BRAND_RED);
    save();
    await waitFor(() => expect(updateGymSettingsAction).toHaveBeenCalled());
    expect(sent().console).toEqual({ primaryColor: BRAND_RED });
    // The member portal colour is a different screen's setting: never sent here.
    expect(sent().memberPortal).toBeUndefined();
  });

  it('loads a saved colour, and goes back to the default', async () => {
    renderForm('#7c3aed');
    expect(hexBox()).toHaveValue('#7c3aed');
    fireEvent.click(screen.getByRole('button', { name: 'Back to the default colour' }));
    expect(hexBox()).toHaveValue(DEFAULT_PORTAL_ACCENT);
    save();
    await waitFor(() => expect(updateGymSettingsAction).toHaveBeenCalled());
    expect(sent().console).toEqual({ primaryColor: null });
  });

  it('refuses a colour that is not a hex', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different colour' }));
    fireEvent.change(hexBox(), { target: { value: 'red' } });
    save();
    expect(await screen.findByText('Enter a hex colour like #1a7fd6.')).toBeInTheDocument();
    expect(updateGymSettingsAction).not.toHaveBeenCalled();
  });

  // The checkbox reflects the data: ticked when the two colours already match.
  it('starts unticked when the member portal has its own colour', () => {
    renderForm('#7c3aed', '#e548c8');
    expect(syncBox()).not.toBeChecked();
  });

  it('starts ticked when the two colours already match, even both on the default', () => {
    renderForm('#7C3AED', '#7c3aed');
    expect(syncBox()).toBeChecked();
    cleanup();
    renderForm(null, null);
    expect(syncBox()).toBeChecked();
  });

  it('ticked, saves the console colour onto the member portal too', async () => {
    renderForm(null);
    fireEvent.click(screen.getByRole('button', { name: 'Use a different colour' }));
    fireEvent.change(hexBox(), { target: { value: '#7c3aed' } });
    fireEvent.click(syncBox());
    save();
    await waitFor(() => expect(updateGymSettingsAction).toHaveBeenCalled());
    expect(sent().console).toEqual({ primaryColor: '#7c3aed' });
    expect(sent().memberPortal).toEqual({ primaryColor: '#7c3aed' });
  });

  // Unticking cuts the link: the member portal keeps whatever it had.
  it('unticked, leaves the member portal colour alone', async () => {
    renderForm('#7c3aed', '#7c3aed');
    fireEvent.click(syncBox());
    fireEvent.change(hexBox(), { target: { value: '#0f766e' } });
    save();
    await waitFor(() => expect(updateGymSettingsAction).toHaveBeenCalled());
    expect(sent().console).toEqual({ primaryColor: '#0f766e' });
    expect(sent().memberPortal).toBeUndefined();
  });
});
