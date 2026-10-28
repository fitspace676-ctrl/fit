import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import { AUTOMATION_CONDITION_FIELDS, AUTOMATION_TIMING_PRESETS } from '@fit/types';
import type { BuilderCatalog } from './condition-builder';
import { RuleFormDialog } from './rule-form-dialog';

// `./actions`, `next/navigation` and `useToast` are mocked in builder.test.tsx,
// the runner's entry for this spec, so the mocks land before any import.

const catalog: BuilderCatalog = {
  conditionFields: AUTOMATION_CONDITION_FIELDS,
  timings: AUTOMATION_TIMING_PRESETS,
  conditionOptions: { locations: [], plans: [], tags: [] },
};
const form = messages.admin.automation.form;
const actions = messages.admin.automation.actions;

describe('RuleFormDialog', () => {
  it('restricts a gym-recipient trigger to the email action without conditions', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <RuleFormDialog mode="create" catalog={catalog} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    const button = (label: string) => screen.getByRole('button', { name: label });
    expect(button(actions.push_notification)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByLabelText(form.trigger), {
      target: { value: 'product_stock_low' },
    });

    expect(button(actions.email)).toHaveAttribute('aria-pressed', 'true');
    expect(button(actions.email)).not.toHaveAttribute('aria-disabled');
    for (const action of [actions.push_notification, actions.sms, actions.create_task]) {
      expect(button(action)).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(button(action));
      expect(button(action)).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByText(form.gymRecipientHint)).toBeInTheDocument();
    expect(screen.getByText(form.conditionsUnavailable)).toBeInTheDocument();
    const vars = screen.getByText(form.mergeHint).parentElement as HTMLElement;
    expect(
      within(vars).queryByText(messages.admin.automation.mergeGroups.member),
    ).not.toBeInTheDocument();
    cleanup();
  });
});
