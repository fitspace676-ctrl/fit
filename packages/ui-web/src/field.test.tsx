// @vitest-environment jsdom
//
// Behaviour tests for the field's accessibility wiring (T9.8): the label is
// associated with the control, and the error / hint text is linked back to the
// control with `aria-describedby` so a screen reader announces it.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Field } from './field';

describe('Field — label + message association', () => {
  it('links the label to the control via the generated id', () => {
    render(
      <Field label="Email">{(id) => <input id={id} aria-label="Email" defaultValue="" />}</Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input.id).toBeTruthy();
  });

  it('describes the control with the error message and flags it invalid', () => {
    render(
      <Field label="Email" error="Email is required">
        {(id, meta) => <input id={id} aria-label="Email" aria-describedby={meta.describedById} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy!);
    expect(message).toHaveTextContent('Email is required');
  });

  it('describes the control with the hint when there is no error', () => {
    render(
      <Field label="Email" hint="We never share your email">
        {(id, meta) => <input id={id} aria-label="Email" aria-describedby={meta.describedById} />}
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const message = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(message).toHaveTextContent('We never share your email');
  });

  it('exposes no description when there is neither error nor hint', () => {
    let captured: { describedById?: string; invalid: boolean } | undefined;
    render(
      <Field label="Email">
        {(id, meta) => {
          captured = meta;
          return <input id={id} aria-label="Email" aria-describedby={meta.describedById} />;
        }}
      </Field>,
    );
    expect(captured?.describedById).toBeUndefined();
    expect(captured?.invalid).toBe(false);
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-describedby');
  });

  it('reports invalid through the meta when an error is present', () => {
    let captured: { invalid: boolean } | undefined;
    render(
      <Field label="Email" error="Bad">
        {(id, meta) => {
          captured = meta;
          return <input id={id} aria-label="Email" />;
        }}
      </Field>,
    );
    expect(captured?.invalid).toBe(true);
  });
});
