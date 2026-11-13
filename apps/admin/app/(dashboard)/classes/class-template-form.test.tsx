import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { en } from '@fit/i18n';
import type { AdminClassTypeOption } from '@fit/types';
import { ClassTemplateForm } from './class-template-form';

vi.mock('./actions', () => ({
  createClassTemplateAction: vi.fn(),
  requestClassImageUploadAction: vi.fn(),
  updateClassTemplateAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

function type(id: string, name: string, description: string): AdminClassTypeOption {
  return {
    id,
    name,
    description,
    durationMinutes: 60,
    capacity: 12,
    color: '#ef4444',
    pricingRule: 'FREE',
    priceMinor: null,
    includedPlanIds: [],
    minAttendance: null,
  };
}

const TYPES = [
  type('ct-boxing', 'Boxing', 'Pads, bags and footwork.'),
  type('ct-yoga', 'Yoga', 'Slow flow for all levels.'),
  type('ct-spin', 'Spin', ''),
];

function renderForm() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClassTemplateForm
        mode="create"
        trainers={[]}
        locations={[]}
        plans={[]}
        classTypes={TYPES}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  const typeSelect = document.getElementById('class-type') as HTMLSelectElement;
  const description = document.getElementById('class-description') as HTMLTextAreaElement;
  return { typeSelect, description };
}

describe('ClassTemplateForm — class type description', () => {
  it('copies the picked type’s description into an empty description', () => {
    const { typeSelect, description } = renderForm();
    fireEvent.change(typeSelect, { target: { value: 'ct-boxing' } });
    expect(description.value).toBe('Pads, bags and footwork.');
  });

  it('swaps it when another type is picked, while it is still the type’s text', () => {
    const { typeSelect, description } = renderForm();
    fireEvent.change(typeSelect, { target: { value: 'ct-boxing' } });
    fireEvent.change(typeSelect, { target: { value: 'ct-yoga' } });
    expect(description.value).toBe('Slow flow for all levels.');
  });

  it('never overwrites a description the operator wrote', () => {
    const { typeSelect, description } = renderForm();
    fireEvent.change(description, { target: { value: 'My own words' } });
    fireEvent.change(typeSelect, { target: { value: 'ct-boxing' } });
    expect(description.value).toBe('My own words');
    expect(screen.getByDisplayValue('My own words')).toBeTruthy();
  });
});
