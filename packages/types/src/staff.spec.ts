import { describe, expect, it } from 'vitest';
import { inviteStaffSchema } from './staff';

const valid = {
  email: ' STAFF@example.com ',
  role: 'RECEPTIONIST',
  firstName: ' Nino ',
  lastName: ' Beridze ',
  locationIds: ['loc-1'],
};
describe('staff invitation identity', () => {
  it('normalises names and email', () => {
    expect(inviteStaffSchema.parse(valid)).toEqual({
      ...valid,
      email: 'staff@example.com',
      firstName: 'Nino',
      lastName: 'Beridze',
    });
  });
  it.each([
    { firstName: '' },
    { firstName: ' ' },
    { lastName: '' },
    { lastName: 'x'.repeat(61) },
    { firstName: 'x'.repeat(61) },
    { locationIds: [] },
    { locationIds: [' '] },
  ])('rejects missing or invalid details: %o', (patch) => {
    expect(inviteStaffSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
