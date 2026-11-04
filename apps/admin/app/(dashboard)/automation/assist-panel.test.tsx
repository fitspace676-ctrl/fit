import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import type { AutomationDraft } from '@fit/types';
import { AssistPanel } from './assist-panel';
import type { assistAutomationRuleAction } from './actions';

type Assist = typeof assistAutomationRuleAction;

const CURRENT: AutomationDraft = { actionType: 'push_notification', active: true };

function renderPanel(assist: Assist, onApply = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AssistPanel draft={CURRENT} onApply={onApply} assist={assist} />
    </NextIntlClientProvider>,
  );
  return onApply;
}

function ask(message: string): void {
  fireEvent.change(screen.getByLabelText('Describe the rule'), { target: { value: message } });
  fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
}

afterEach(cleanup);

describe('AssistPanel', () => {
  it('applies a draft and shows the explanation', async () => {
    const draft: AutomationDraft = {
      triggerType: 'member_joined',
      actionType: 'email',
      actionConfig: { body: 'Hi {{member_first_name}}' },
    };
    const assist = vi.fn<Assist>().mockResolvedValue({
      ok: true,
      data: {
        kind: 'draft',
        draft,
        explanation: 'Welcomes new members.',
        complete: true,
        model: 'm',
      },
    });
    const onApply = renderPanel(assist);
    ask('Welcome new members by email');
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Welcomes new members.');
    expect(status).toHaveTextContent('The form was filled in');
    expect(assist).toHaveBeenCalledWith({
      message: 'Welcome new members by email',
      locale: 'en',
      draft: CURRENT,
      history: [],
    });
  });

  it('shows a question without touching the form', async () => {
    const assist = vi.fn<Assist>().mockResolvedValue({
      ok: true,
      data: { kind: 'question', question: 'Which branch?', model: 'm' },
    });
    const onApply = renderPanel(assist);
    ask('Email members at my branch');
    expect(await screen.findByRole('status')).toHaveTextContent('Which branch?');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('shows an error as an alert', async () => {
    const assist = vi.fn<Assist>().mockResolvedValue({ ok: false, error: 'boom' });
    renderPanel(assist);
    ask('Anything');
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('sends the earlier turns as history on a refinement', async () => {
    const assist = vi.fn<Assist>().mockResolvedValue({
      ok: true,
      data: { kind: 'question', question: 'Which branch?', model: 'm' },
    });
    renderPanel(assist);
    ask('Email members at my branch');
    await screen.findByRole('status');
    ask('Saburtalo');
    await waitFor(() => expect(assist).toHaveBeenCalledTimes(2));
    expect(assist.mock.calls[1]?.[0]).toEqual({
      message: 'Saburtalo',
      locale: 'en',
      draft: CURRENT,
      history: [
        { role: 'user', content: 'Email members at my branch' },
        { role: 'assistant', content: 'Which branch?' },
      ],
    });
  });
});
