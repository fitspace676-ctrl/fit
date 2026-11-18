import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import { MessageTools } from './message-tools';
import { assistMessageAction, previewMessageAction } from './actions';

vi.mock('./actions', () => ({ assistMessageAction: vi.fn(), previewMessageAction: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(body = '') {
  const onApply = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MessageTools subject="Original" body={body} channel="email" onApply={onApply} />
    </NextIntlClientProvider>,
  );
  return onApply;
}

describe('MessageTools', () => {
  it('writes from an empty editor, applies only on acceptance, and can undo', async () => {
    vi.mocked(assistMessageAction).mockResolvedValue({
      ok: true,
      data: {
        kind: 'draft',
        draft: { actionConfig: { subject: 'Welcome', body: 'Hi {{first_name}}' } },
        explanation: 'Ready',
        complete: false,
        model: 'm',
      },
    });
    const onApply = setup();
    fireEvent.change(screen.getByLabelText('What should the message say?'), {
      target: { value: 'Welcome members' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }));
    const accept = await screen.findByRole('button', { name: 'Use this text' });
    expect(onApply).not.toHaveBeenCalled();
    // The button renders while the transition that produced the draft is still
    // pending, and it is disabled until that settles. Clicking before then is a
    // no-op, which made this test fail intermittently.
    await waitFor(() => expect(accept).toBeEnabled());
    fireEvent.click(accept);
    expect(onApply).toHaveBeenCalledWith({ subject: 'Welcome', body: 'Hi {{first_name}}' });
    expect(assistMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: 'marketing',
        marketingCopy: { subject: 'Original', body: '' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo AI changes' }));
    expect(onApply).toHaveBeenLastCalledWith({ subject: 'Original', body: '' });
  });

  it('improves existing copy but leaves it intact on a question or failure', async () => {
    vi.mocked(assistMessageAction).mockResolvedValue({
      ok: true,
      data: {
        kind: 'question',
        question: 'What date?',
        model: 'm',
      },
    });
    const onApply = setup('Original body');
    fireEvent.click(screen.getByRole('button', { name: 'Improve text' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('What date?');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows the server-rendered sample and never applies it to the reusable template', async () => {
    vi.mocked(previewMessageAction).mockResolvedValue({
      ok: true,
      data: {
        recipient: 'nino@example.com',
        subject: 'Hello Nino',
        body: 'Welcome',
      },
    });
    const onApply = setup('Hello {{first_name}}');
    fireEvent.click(screen.getByRole('button', { name: 'Preview with member data' }));
    expect(await screen.findByText('Hello Nino')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
});
