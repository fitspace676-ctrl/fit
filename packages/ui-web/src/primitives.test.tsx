// @vitest-environment jsdom
//
// Behaviour tests for the primitive accessibility affordances (T9.8): the
// progress bar is exposed as a `progressbar` with a clamped value, and the skip
// link targets the shell's main landmark.

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Progress, SkipLink } from './primitives';

describe('Progress — progressbar semantics', () => {
  it('exposes the value with min / max bounds', () => {
    render(<Progress value={42} label="Upload" />);
    const bar = screen.getByRole('progressbar', { name: 'Upload' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps out-of-range values to 0–100', () => {
    const { rerender } = render(<Progress value={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    rerender(<Progress value={140} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});

describe('SkipLink', () => {
  it('links to the default main-content landmark', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: 'Skip to main content' });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('honours a custom target id and label', () => {
    render(<SkipLink targetId="app-body">Jump to content</SkipLink>);
    const link = screen.getByRole('link', { name: 'Jump to content' });
    expect(link).toHaveAttribute('href', '#app-body');
  });
});
