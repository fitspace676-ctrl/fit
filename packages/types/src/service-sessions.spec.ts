import { describe, expect, it } from 'vitest';
import { serviceLabel } from './service-sessions';

describe('serviceLabel', () => {
  it('does not name the trainer twice when the service is already named after them', () => {
    expect(serviceLabel('Personal session - data iobashvili', 'data iobashvili')).toBe(
      'Personal session - data iobashvili',
    );
    expect(serviceLabel('პერსონალური ვარჯიში - ნინო', 'ნინო')).toBe('პერსონალური ვარჯიში - ნინო');
  });

  it('adds the staff member to a service that does not carry their name', () => {
    expect(serviceLabel('Massage', 'Levan M.')).toBe('Massage · Levan M.');
  });

  it('matches the name case-insensitively and ignores a blank staff name', () => {
    expect(serviceLabel('Personal session - Data Iobashvili', 'data iobashvili')).toBe(
      'Personal session - Data Iobashvili',
    );
    expect(serviceLabel('Massage', '  ')).toBe('Massage');
  });
});
