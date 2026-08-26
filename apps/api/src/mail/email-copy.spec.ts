import { describe, expect, it } from 'vitest';
import { EMAIL_STRINGS } from './email-strings';

/**
 * House copy rule: member-facing email text never uses an em-dash or a double
 * hyphen - a plain "-" is the only dash the copy carries. Every string in the
 * copy set is exercised with sample arguments so a function-valued entry is
 * checked too.
 */
function flatten(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (typeof value === 'function') {
    out.push([path, String((value as (...args: unknown[]) => string)('Gym', 'x', 3, 'y'))]);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, `${path}.${key}`, out);
    }
  }
}

describe('email copy dash rule', () => {
  it('keeps every fixed email string, in every language, free of em-dashes and double hyphens', () => {
    const strings: Array<[string, string]> = [];
    flatten(EMAIL_STRINGS, 'EMAIL_STRINGS', strings);
    expect(strings.length).toBeGreaterThan(100);
    for (const [path, copy] of strings) {
      expect(copy, path).not.toMatch(/—|–|--/);
    }
  });
});
