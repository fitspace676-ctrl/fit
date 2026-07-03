import { describe, expect, it } from 'vitest';

import {
  fieldErrorText,
  formBannerClasses,
  formGridClasses,
  FORM_LEGEND_CLASS,
  type FieldErrors,
} from './form';

/** Build a loosely-typed errors tree for the path-walking tests. */
const errs = (o: unknown) => o as FieldErrors;

describe('fieldErrorText', () => {
  it('reads a top-level field message', () => {
    const errors = { name: { type: 'too_small', message: 'Name is required' } };
    expect(fieldErrorText(errs(errors), 'name')).toBe('Name is required');
  });

  it('walks a nested / indexed path', () => {
    const errors = {
      variants: { 0: { price: { type: 'min', message: 'Price must be positive' } } },
    };
    expect(fieldErrorText(errs(errors), 'variants.0.price')).toBe('Price must be positive');
  });

  it('returns undefined when the field has no error', () => {
    expect(fieldErrorText(errs({ name: { message: 'x' } }), 'email')).toBeUndefined();
    expect(fieldErrorText(errs({}), 'name')).toBeUndefined();
  });

  it('ignores a missing or non-string / empty message', () => {
    // A parent node exists but carries no leaf message (nested errors only).
    expect(fieldErrorText(errs({ variants: { 0: {} } }), 'variants')).toBeUndefined();
    expect(fieldErrorText(errs({ name: { message: 42 } }), 'name')).toBeUndefined();
    expect(fieldErrorText(errs({ name: { message: '' } }), 'name')).toBeUndefined();
  });
});

describe('formGridClasses', () => {
  it('is a single column by default', () => {
    const cls = formGridClasses();
    expect(cls).toContain('grid');
    expect(cls).toContain('grid-cols-1');
    expect(cls).not.toContain('sm:grid-cols-2');
  });

  it('adds responsive breakpoints per column count', () => {
    expect(formGridClasses(2)).toContain('sm:grid-cols-2');
    expect(formGridClasses(3)).toContain('lg:grid-cols-3');
  });

  it('appends caller classes and trims', () => {
    const cls = formGridClasses(2, 'mt-4');
    expect(cls).toContain('mt-4');
    expect(cls.startsWith(' ')).toBe(false);
    expect(cls.endsWith(' ')).toBe(false);
  });
});

describe('formBannerClasses', () => {
  it('carries the shared banner shell', () => {
    const cls = formBannerClasses('info');
    expect(cls).toContain('rounded-card');
    expect(cls).toContain('text-sm');
  });

  it('maps each tone to its own colour set', () => {
    expect(formBannerClasses('danger')).toContain('text-danger-700');
    expect(formBannerClasses('success')).toContain('text-success-700');
    expect(formBannerClasses('warning')).toContain('text-warning-700');
    expect(formBannerClasses('info')).toContain('text-brand-700');
  });

  it('appends caller classes and trims', () => {
    const cls = formBannerClasses('success', 'mt-2');
    expect(cls).toContain('mt-2');
    expect(cls.startsWith(' ')).toBe(false);
    expect(cls.endsWith(' ')).toBe(false);
  });
});

describe('FORM_LEGEND_CLASS', () => {
  it('is the mono uppercase eyebrow shared by every section', () => {
    expect(FORM_LEGEND_CLASS).toContain('font-mono');
    expect(FORM_LEGEND_CLASS).toContain('uppercase');
  });
});
