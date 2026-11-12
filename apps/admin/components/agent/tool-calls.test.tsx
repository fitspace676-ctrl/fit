import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import ka from '@fit/i18n/locales/ka.json';
import en from '@fit/i18n/locales/en.json';
import { AgentToolCalls } from './tool-calls';
import type { AgentToolCall } from './types';

const call: AgentToolCall = {
  id: 'create',
  name: 'create_member',
  status: 'awaiting_approval',
  input: { dateOfBirth: '2000-01-01', gender: 'OTHER', active: false, customField: 'unchanged' },
};

describe('tool card localization', () => {
  it.each([
    ['ka', ka, 'დაბადების თარიღი', 'სხვა', 'არა'],
    ['en', en, 'Date of birth', 'Other', 'No'],
  ] as const)(
    'localizes fields and enums in %s without changing approval inputs',
    (locale, messages, label, gender, active) => {
      const decide = vi.fn();
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AgentToolCalls calls={[call]} busy={false} decide={decide} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(gender)).toBeInTheDocument();
      expect(screen.getByText(active)).toBeInTheDocument();
      expect(screen.getByText('custom Field')).toBeInTheDocument();
      expect(screen.getByText('unchanged')).toBeInTheDocument();
      expect(screen.getByText('2000-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: messages.admin.agent.approve }));
      expect(decide).toHaveBeenCalledWith({ create: 'approve' });
      expect(call.input?.gender).toBe('OTHER');
    },
  );
});

describe('tool call layout', () => {
  const reads: AgentToolCall[] = [
    {
      id: 'r1',
      name: 'list_members',
      title: 'Members',
      kind: 'read',
      status: 'complete',
      durationMs: 400,
    },
    {
      id: 'r2',
      name: 'checkins',
      title: 'Check-ins',
      kind: 'read',
      status: 'complete',
      durationMs: 500,
    },
  ];
  const write = (id: string, extra: Partial<AgentToolCall> = {}): AgentToolCall => ({
    id,
    name: 'send_message',
    title: 'Send message',
    kind: 'write',
    status: 'awaiting_approval',
    input: { subject: 'Hi' },
    ...extra,
  });
  const renderCalls = (calls: AgentToolCall[], decide = vi.fn()) =>
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <AgentToolCalls calls={calls} busy={false} decide={decide} />
      </NextIntlClientProvider>,
    );

  it('folds reads into one line that opens into rows', () => {
    renderCalls(reads);
    const head = screen.getByRole('button', { name: /2 actions done/ });
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Members')).not.toBeInTheDocument();
    fireEvent.click(head);
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('Check-ins')).toBeInTheDocument();
  });

  it('marks a destructive write and folds the details of a repeated one', () => {
    renderCalls([write('w1', { destructive: true }), write('w2')]);
    expect(screen.getByText(en.admin.agent.irreversible)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: en.admin.agent.approveAndDelete }),
    ).toBeInTheDocument();
    // The second card's inputs start folded behind "Details".
    expect(screen.getAllByText('Hi')).toHaveLength(1);
    expect(screen.getByRole('button', { name: en.admin.agent.details })).toBeInTheDocument();
  });

  it('approves every pending write at once', () => {
    const decide = vi.fn();
    renderCalls([write('w1'), write('w2')], decide);
    fireEvent.click(screen.getByRole('button', { name: 'Approve all (2)' }));
    expect(decide).toHaveBeenCalledWith({ w1: 'approve', w2: 'approve' });
  });
});
