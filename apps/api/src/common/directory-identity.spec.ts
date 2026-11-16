import { describe, expect, it } from 'vitest';
import { contactEmail, isPlaceholderEmail, placeholderEmail } from './directory-identity';

describe('directory identity', () => {
  it('blanks a synthetic placeholder and keeps a real address', () => {
    const synthetic = placeholderEmail();
    expect(isPlaceholderEmail(synthetic)).toBe(true);
    expect(contactEmail(synthetic)).toBe('');
    expect(contactEmail('imported-7@no-login.fit.local')).toBe('');
    expect(contactEmail('member@example.com')).toBe('member@example.com');
  });
});
