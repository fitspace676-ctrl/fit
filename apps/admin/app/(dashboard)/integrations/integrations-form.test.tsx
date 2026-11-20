import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en, ka } from '@fit/i18n';
import type { GymIntegration } from '@fit/types';
import { ToastProvider } from '@/components/ui';
import { IntegrationsForm } from './integrations-form';
import { changeFlitt } from './actions';

vi.mock('./actions', () => ({ changeFlitt: vi.fn() }));
const disconnected: GymIntegration = {
  provider: 'flitt',
  connected: false,
  enabled: false,
  merchantId: null,
  secretHint: null,
  verifiedAt: null,
  lastError: null,
  testMode: false,
};
const connected: GymIntegration = {
  ...disconnected,
  connected: true,
  merchantId: '1549901',
  secretHint: 'test',
  verifiedAt: '2026-11-20T12:00:00Z',
  testMode: true,
};
const t = en.admin.integrations;
function show(initial = disconnected) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ToastProvider>
        <IntegrationsForm initial={initial} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}
function fill(secret = 'private-key') {
  fireEvent.change(screen.getByLabelText(t.merchantId), { target: { value: '1549901' } });
  fireEvent.change(screen.getByLabelText(t.secretKey), { target: { value: secret } });
}
beforeEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('Flitt integration', () => {
  it.each([
    [disconnected, t.state.disconnected],
    [connected, t.state.off],
    [{ ...connected, enabled: true }, t.state.active],
  ] as const)('renders status %s', (initial, label) => {
    show(initial);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: t.enable })).toHaveAttribute(
      'aria-checked',
      String(initial.enabled),
    );
  });
  it('shows masked credentials and verification, never a prefilled secret', () => {
    show(connected);
    expect(screen.getByText('••••test')).toBeInTheDocument();
    expect(screen.getByText(t.testMode)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.replace }));
    expect(screen.getByLabelText(t.merchantId)).toHaveValue('1549901');
    expect(screen.getByLabelText(t.secretKey)).toHaveValue('');
    expect(screen.getByLabelText(t.secretKey)).toHaveAttribute('type', 'password');
  });
  it('validates required credentials and schema lengths without calling the action', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    expect(screen.getByText(t.merchantInvalid)).toBeInTheDocument();
    expect(screen.getByText(t.secretInvalid)).toBeInTheDocument();
    fill('x'.repeat(201));
    fireEvent.change(screen.getByLabelText(t.merchantId), { target: { value: '1234567890123' } });
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    expect(changeFlitt).not.toHaveBeenCalled();
  });
  it('accepts digits only and clears the submitted secret after connecting', async () => {
    show();
    fill();
    fireEvent.change(screen.getByLabelText(t.merchantId), { target: { value: '154a9901' } });
    expect(screen.getByLabelText(t.merchantId)).toHaveValue('1549901');
    vi.mocked(changeFlitt).mockResolvedValue({ ok: true, data: connected });
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    await waitFor(() => expect(screen.queryByLabelText(t.secretKey)).not.toBeInTheDocument());
    expect(document.body.textContent).not.toContain('private-key');
    fireEvent.click(screen.getByRole('button', { name: t.replace }));
    expect(screen.getByLabelText(t.secretKey)).toHaveValue('');
  });
  it.each([
    'bad_key',
    'unknown_merchant',
    'unreachable',
    'notConfigured',
    'notVerified',
    'forbidden',
  ] as const)('shows %s inline', async (error) => {
    vi.mocked(changeFlitt).mockResolvedValue({ ok: false, error });
    show();
    fill();
    fireEvent.click(screen.getByRole('button', { name: t.connect }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errors[error]);
  });
  it.each([false, true])('changes enabled from %s only after API success', async (enabled) => {
    show({ ...connected, enabled });
    vi.mocked(changeFlitt).mockResolvedValue({
      ok: true,
      data: { ...connected, enabled: !enabled },
    });
    fireEvent.click(screen.getByRole('switch', { name: t.enable }));
    await waitFor(() =>
      expect(changeFlitt).toHaveBeenCalledWith({ kind: 'enable', enabled: !enabled }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', String(!enabled)),
    );
  });
  it('checks connection and refreshes the disabled status on failed verification', async () => {
    show({ ...connected, enabled: true });
    vi.mocked(changeFlitt).mockResolvedValue({
      ok: false,
      error: 'bad_key',
      data: { ...connected, enabled: false, lastError: 'bad_key', verifiedAt: null },
    });
    fireEvent.click(screen.getByRole('button', { name: t.test }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.bad_key);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
  it('reports a successful connection check', async () => {
    show(connected);
    vi.mocked(changeFlitt).mockResolvedValue({ ok: true, data: connected, tested: true });
    fireEvent.click(screen.getByRole('button', { name: t.test }));
    await waitFor(() => expect(screen.getAllByText(t.testSuccess).length).toBeGreaterThan(0));
  });
  it('disconnects only after confirmation, and allows cancellation', async () => {
    show(connected);
    fireEvent.click(screen.getByRole('button', { name: t.disconnect }));
    expect(changeFlitt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.cancel }));
    expect(changeFlitt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.disconnect }));
    vi.mocked(changeFlitt).mockResolvedValue({ ok: true, data: disconnected });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t.disconnect }));
    await waitFor(() => expect(changeFlitt).toHaveBeenCalledWith({ kind: 'disconnect' }));
    expect(await screen.findByText(t.state.disconnected)).toBeInTheDocument();
  });
  it('keeps en/ka keys in parity', () => {
    expect(Object.keys(ka.admin.integrations).sort()).toEqual(Object.keys(t).sort());
    expect(Object.keys(ka.admin.integrations.errors).sort()).toEqual(Object.keys(t.errors).sort());
    expect(Object.keys(ka.admin.integrations.state).sort()).toEqual(Object.keys(t.state).sort());
  });
});
