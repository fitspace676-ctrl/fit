import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import { AccessCard } from './access-card';
import { setZktecoMemberCard } from '../../integrations/zkteco-actions';
vi.mock('../../integrations/zkteco-actions', () => ({ setZktecoMemberCard: vi.fn() }));
const t = en.admin.integrations.zkteco;
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
function show() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AccessCard memberId="member-id" />
    </NextIntlClientProvider>,
  );
}
it('requires an explicit number to replace and explicitly clears with null', async () => {
  vi.mocked(setZktecoMemberCard).mockResolvedValue({ ok: true });
  show();
  expect(screen.getByRole('button', { name: t.saveCard })).toBeDisabled();
  expect(screen.getByText(t.cardHint)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(t.cardNumber), { target: { value: '4294967295' } });
  fireEvent.click(screen.getByRole('button', { name: t.saveCard }));
  await screen.findByText(t.cardSaved);
  expect(setZktecoMemberCard).toHaveBeenCalledWith('member-id', '4294967295');
  fireEvent.click(screen.getByRole('button', { name: t.clearCard }));
  await waitFor(() => expect(setZktecoMemberCard).toHaveBeenCalledWith('member-id', null));
});
it.each(['4294967296', '12345678901', 'abc'])('rejects invalid card %s', async (value) => {
  show();
  fireEvent.change(screen.getByLabelText(t.cardNumber), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: t.saveCard }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.invalidCard);
  expect(setZktecoMemberCard).not.toHaveBeenCalled();
});
it('explains duplicate card conflicts', async () => {
  vi.mocked(setZktecoMemberCard).mockResolvedValue({ ok: false, error: 'cardInUse' });
  show();
  fireEvent.change(screen.getByLabelText(t.cardNumber), { target: { value: '123' } });
  fireEvent.click(screen.getByRole('button', { name: t.saveCard }));
  expect(await screen.findByRole('alert')).toHaveTextContent(t.errors.cardInUse);
});
