// @vitest-environment jsdom
//
// Behaviour tests for the toast accessibility (T9.8): the stack is a polite
// live region so screen readers announce each toast without stealing focus.

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { ToastProvider, useToast } from './toast';

function Trigger() {
  const { toast } = useToast();
  return (
    <button type="button" onClick={() => toast('Saved changes')}>
      fire
    </button>
  );
}

describe('ToastProvider — live region', () => {
  it('renders a polite status region for announcements', () => {
    render(
      <ToastProvider>
        <span>app</span>
      </ToastProvider>,
    );
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'false');
  });

  it('surfaces the toast message inside the live region', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Saved changes');
  });
});
