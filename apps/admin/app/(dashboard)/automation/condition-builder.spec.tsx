import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseOption, selectedValue } from '@fit/ui-kit/testing';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@fit/i18n/locales/en.json';
import {
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_TIMING_PRESETS,
  type AutomationCondition,
} from '@fit/types';
import { ConditionBuilder, type BuilderCatalog } from './condition-builder';

const catalog: BuilderCatalog = {
  conditionFields: AUTOMATION_CONDITION_FIELDS,
  timings: AUTOMATION_TIMING_PRESETS,
  conditionOptions: {
    locations: [{ id: 'branch-1', name: 'Downtown' }],
    plans: [{ id: 'plan-1', name: 'Monthly' }],
    tags: ['VIP'],
  },
};
function Harness({
  seed = [],
  options = catalog,
}: {
  seed?: AutomationCondition[];
  options?: BuilderCatalog;
}) {
  const [conditions, setConditions] = useState(seed);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConditionBuilder conditions={conditions} catalog={options} onChange={setConditions} />
      <output>{JSON.stringify(conditions)}</output>
    </NextIntlClientProvider>
  );
}

describe('ConditionBuilder', () => {
  it('adds, validates, changes field and removes a condition', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('This rule runs for all members')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await chooseOption(user, screen.getByLabelText('Value'), 'Female');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await chooseOption(user, screen.getByLabelText('Field'), 'Age');
    expect(screen.getByLabelText('Value')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '25' } });
    expect(screen.getByRole('status')).toHaveTextContent('"value":25');
    await chooseOption(user, screen.getByLabelText('Operator'), 'At least');
    expect(screen.getByLabelText('Value')).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition' }));
    expect(screen.getByText('This rule runs for all members')).toBeInTheDocument();
    cleanup();
  });
  it('supports multiple enum values and clears them for emptiness checks', async () => {
    const user = userEvent.setup();
    render(
      <Harness seed={[{ field: 'member_gender', operator: 'in', value: ['MALE', 'FEMALE'] }]} />,
    );
    expect(screen.getByLabelText('Value')).toHaveValue(['MALE', 'FEMALE']);
    await chooseOption(user, screen.getByLabelText('Operator'), 'Is empty');
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('value');
    cleanup();
  });
  it('shows tenant option labels and stores their IDs', async () => {
    const user = userEvent.setup();
    render(<Harness seed={[{ field: 'member_branch', operator: 'eq' }]} />);
    await chooseOption(user, screen.getByLabelText('Value'), 'Downtown');
    expect(screen.getByLabelText('Value')).toHaveTextContent('Downtown');
    expect(selectedValue(screen.getByLabelText('Value'))).toBe('branch-1');
    expect(screen.getByRole('status')).toHaveTextContent('branch-1');
    cleanup();
  });
  it('accepts free-text tags when catalog options are unavailable', () => {
    render(
      <Harness
        options={{ ...catalog, conditionOptions: { locations: [], plans: [], tags: [] } }}
        seed={[{ field: 'member_tags', operator: 'contains' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'VIP' } });
    expect(screen.getByRole('status')).toHaveTextContent('VIP');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    cleanup();
  });
  it('limits conditions to ten and displays AND between them', () => {
    render(
      <Harness
        seed={Array.from({ length: 10 }, () => ({ field: 'member_gender', operator: 'is_empty' }))}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
    expect(screen.getAllByText('AND')).toHaveLength(9);
    cleanup();
  });
});
