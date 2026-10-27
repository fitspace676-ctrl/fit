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
    ['ka', ka, 'დაბადების თარიღი:', 'სხვა', 'არა'],
    ['en', en, 'Date of birth:', 'Other', 'No'],
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
      expect(screen.getByText('custom Field:')).toBeInTheDocument();
      expect(screen.getByText('unchanged')).toBeInTheDocument();
      expect(screen.getByText('2000-01-01')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: messages.admin.agent.approve }));
      expect(decide).toHaveBeenCalledWith({ create: 'approve' });
      expect(call.input?.gender).toBe('OTHER');
    },
  );
});
