import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
  it('adds, validates, changes field and removes a condition', () => {
    render(<Harness />);
    expect(screen.getByText('This rule runs for all members')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'FEMALE' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'member_age' } });
    expect(screen.getByLabelText('Value')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '25' } });
    expect(screen.getByRole('status')).toHaveTextContent('"value":25');
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'gte' } });
    expect(screen.getByLabelText('Value')).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition' }));
    expect(screen.getByText('This rule runs for all members')).toBeInTheDocument();
    cleanup();
  });
  it('supports multiple enum values and clears them for emptiness checks', () => {
    render(
      <Harness seed={[{ field: 'member_gender', operator: 'in', value: ['MALE', 'FEMALE'] }]} />,
    );
    expect(screen.getByLabelText('Value')).toHaveValue(['MALE', 'FEMALE']);
    fireEvent.change(screen.getByLabelText('Operator'), { target: { value: 'is_empty' } });
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('value');
    cleanup();
  });
  it('shows tenant option labels and stores their IDs', () => {
    render(<Harness seed={[{ field: 'member_branch', operator: 'eq' }]} />);
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'branch-1' } });
    expect(screen.getByRole('option', { name: 'Downtown' })).toBeInTheDocument();
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
