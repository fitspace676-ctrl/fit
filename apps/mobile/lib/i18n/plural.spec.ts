import { describe, expect, it } from 'vitest';
import {
  formatIcuPlurals,
  hasIcuPlural,
  pluralCategory,
  pluralSuffix,
  selectPluralBranch,
} from './plural';

describe('pluralCategory', () => {
  it('is `one` only for the integer 1', () => {
    expect(pluralCategory(1)).toBe('one');
    expect(pluralCategory(-1)).toBe('one');
  });

  it('is `other` for 0, 2 and n', () => {
    for (const count of [0, 2, 3, 11, 21, 100, 1000]) {
      expect(pluralCategory(count), `count=${count}`).toBe('other');
    }
  });

  it('is `other` for a fractional count, including 1.5', () => {
    expect(pluralCategory(1.5)).toBe('other');
    expect(pluralCategory(0.5)).toBe('other');
  });

  it('agrees in both shipped locales — ka and en share the CLDR `one` rule', () => {
    for (const count of [0, 1, 2, 5, 21]) {
      expect(pluralCategory(count, 'ka')).toBe(pluralCategory(count, 'en'));
    }
  });
});

describe('pluralSuffix', () => {
  it('maps the category onto the catalogue key convention', () => {
    expect(pluralSuffix(1)).toBe('One');
    expect(pluralSuffix(0)).toBe('Other');
    expect(pluralSuffix(2)).toBe('Other');
    expect(pluralSuffix(7)).toBe('Other');
  });
});

describe('selectPluralBranch', () => {
  const branches = { '=0': 'No rows', one: '# row', other: '# rows' };

  it('prefers an exact `=N` match over the category', () => {
    expect(selectPluralBranch(branches, 0)).toBe('No rows');
  });

  it('falls back to the CLDR category', () => {
    expect(selectPluralBranch(branches, 1)).toBe('# row');
    expect(selectPluralBranch(branches, 4)).toBe('# rows');
  });

  it('falls back to `other` when the category is absent', () => {
    expect(selectPluralBranch({ other: '# things' }, 1)).toBe('# things');
  });

  it('returns undefined when there is nothing to fall back to', () => {
    expect(selectPluralBranch({ one: 'a thing' }, 3)).toBeUndefined();
  });
});

describe('formatIcuPlurals', () => {
  it('renders a whole-message block, substituting # for the count', () => {
    const message = '{count, plural, one {# class} other {# classes}}';
    expect(formatIcuPlurals(message, { count: 1 })).toBe('1 class');
    expect(formatIcuPlurals(message, { count: 0 })).toBe('0 classes');
    expect(formatIcuPlurals(message, { count: 9 })).toBe('9 classes');
  });

  it('renders a block embedded in surrounding text', () => {
    const message = 'Cart · {count, plural, one {# item} other {# items}}';
    expect(formatIcuPlurals(message, { count: 1 })).toBe('Cart · 1 item');
    expect(formatIcuPlurals(message, { count: 3 })).toBe('Cart · 3 items');
  });

  it('renders more than one block in a single message', () => {
    const message =
      '{a, plural, one {# cat} other {# cats}} and {b, plural, one {# dog} other {# dogs}}';
    expect(formatIcuPlurals(message, { a: 1, b: 4 })).toBe('1 cat and 4 dogs');
  });

  it('honours an exact `=N` branch', () => {
    const message = '{count, plural, =0 {No rows} one {# row} other {# rows}}';
    expect(formatIcuPlurals(message, { count: 0 })).toBe('No rows');
    expect(formatIcuPlurals(message, { count: 1 })).toBe('1 row');
  });

  it('leaves plain {name} placeholders alone for the interpolation pass', () => {
    const message = '{count, plural, one {# item} other {# items}} · {method}';
    expect(formatIcuPlurals(message, { count: 2, method: 'Cash' })).toBe('2 items · {method}');
  });

  it('keeps a {name} placeholder that sits inside the chosen branch', () => {
    const message = '{count, plural, one {# credit for {name}} other {# credits for {name}}}';
    expect(formatIcuPlurals(message, { count: 2, name: 'Nino' })).toBe('2 credits for {name}');
  });

  it('copies a block through verbatim when its argument is not a number', () => {
    const message = '{count, plural, one {# item} other {# items}}';
    expect(formatIcuPlurals(message, { name: 'Nino' })).toBe(message);
    expect(formatIcuPlurals(message, { count: '2' })).toBe(message);
  });

  it('is a no-op with no params, and on messages with no block', () => {
    expect(formatIcuPlurals('{count, plural, one {a} other {b}}')).toBe(
      '{count, plural, one {a} other {b}}',
    );
    expect(formatIcuPlurals('Hello {name}', { name: 'Nino' })).toBe('Hello {name}');
    expect(formatIcuPlurals('Plain text, with a comma', { count: 1 })).toBe(
      'Plain text, with a comma',
    );
  });

  it('copies malformed or unsupported forms through rather than guessing', () => {
    for (const message of [
      '{count, select, male {he} female {she} other {they}}',
      '{count, plural, one {# item} other {# items}', // unterminated
      '{count, plural}',
      '{, plural, one {x} other {y}}',
    ]) {
      expect(formatIcuPlurals(message, { count: 2 }), message).toBe(message);
    }
  });
});

describe('hasIcuPlural', () => {
  it('recognises the forms the catalogues actually use', () => {
    expect(hasIcuPlural('{count, plural, one {# class} other {# classes}}')).toBe(true);
    expect(hasIcuPlural('Cart · {count, plural, one {# item} other {# items}}')).toBe(true);
    expect(hasIcuPlural('{count, plural, =0 {No rows} one {# row} other {# rows}}')).toBe(true);
  });

  it('does not fire on plain placeholders', () => {
    expect(hasIcuPlural('{count} sessions')).toBe(false);
    expect(hasIcuPlural('Renews {date}')).toBe(false);
    expect(hasIcuPlural('No braces at all')).toBe(false);
  });
});
