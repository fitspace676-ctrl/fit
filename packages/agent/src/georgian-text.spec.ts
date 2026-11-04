import { describe, expect, it } from 'vitest';
import { sanitizeGeorgianText } from './georgian-text';

describe('sanitizeGeorgianText', () => {
  it('replaces em and en dashes with a hyphen', () => {
    expect(sanitizeGeorgianText('გამარჯობა — მეგობარო – კარგად')).toBe(
      'გამარჯობა - მეგობარო - კარგად',
    );
  });

  it('folds Mtavruli capitals onto Mkhedruli', () => {
    // "ᲒᲐᲛᲐᲠᲯᲝᲑᲐ" in Mtavruli.
    expect(sanitizeGeorgianText('ᲒᲐᲛᲐᲠᲯᲝᲑᲐ')).toBe('გამარჯობა');
    expect(sanitizeGeorgianText('ᲺᲽᲿ')).toBe('ჺჽჿ');
  });

  it('leaves Latin and plain Georgian text unchanged', () => {
    const text = 'Hello {{member_first_name}}, see you at 10-11! გნახავთ.';
    expect(sanitizeGeorgianText(text)).toBe(text);
  });
});
