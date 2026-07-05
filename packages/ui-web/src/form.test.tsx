// @vitest-environment jsdom
//
// Behaviour tests for the form kit (T9.6): zod validation blocks a bad submit
// and surfaces field messages, a clean submit hands the parsed (coerced) values
// to the caller, and the connected fields clear their error once fixed. These
// exercise the react-hook-form + zod wiring the edit screens depend on.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';

import { Form, NumberField, SubmitButton, TextField, useZodForm } from './form';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.coerce.number().min(18, 'Must be at least 18'),
});
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

function Harness({ onSubmit }: { onSubmit: (values: Parsed) => void }) {
  const form = useZodForm(schema, { defaultValues: { name: '', age: '' } as unknown as Values });
  return (
    <Form form={form} onSubmit={onSubmit}>
      <TextField name="name" label="Name" />
      <NumberField name="age" label="Age" />
      <SubmitButton>Save</SubmitButton>
    </Form>
  );
}

describe('Form — validation', () => {
  it('blocks submit and shows field messages when the input is invalid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    // Leave `name` empty and give `age` a below-minimum value so both the
    // required and the min-rule messages are deterministic.
    await user.type(screen.getByLabelText('Age'), '10');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Must be at least 18')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('flags the invalid control with aria-invalid', async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true'),
    );
  });
});

describe('Form — successful submit', () => {
  it('hands the parsed, coerced values to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<(values: Parsed) => void>();
    render(<Harness onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Age'), '21');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const values = onSubmit.mock.calls[0]![0];
    expect(values).toMatchObject({ name: 'Ada', age: 21 });
    // `age` is coerced to a real number, not the raw string.
    expect(typeof values.age).toBe('number');
  });

  it('clears a field error once the value is corrected and resubmitted', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Bo');
    await user.type(screen.getByLabelText('Age'), '30');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(screen.queryByText('Name is required')).toBeNull();
  });
});
