import { describe, expect, it } from 'vitest';
import { composeName } from './member-intake';

describe('composeName', () => {
  it('joins name and surname with a single space', () => {
    expect(composeName('Ana', 'Beridze')).toBe('Ana Beridze');
  });
  it('trims and drops an empty surname', () => {
    expect(composeName('  Ana  ', '')).toBe('Ana');
    expect(composeName('Ana', '   ')).toBe('Ana');
  });
  it('drops an empty first name', () => {
    expect(composeName('', 'Beridze')).toBe('Beridze');
  });
});
