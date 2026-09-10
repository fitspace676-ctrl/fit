import { describe, expect, it } from 'vitest';
import { classInstanceCardSchema } from './classes';

/**
 * The trainer's identity on the member-facing class contract. The card stays
 * denormalised — `trainerName` is still the string a row renders — but it also
 * carries the id and the photo, so a client can open the trainer and show their
 * face without a name→trainer lookup or a round-trip per row.
 */

const card = () => ({
  id: 'ci-1',
  title: 'Morning Flow',
  startsAt: '2026-06-01T09:00:00.000Z',
  endsAt: '2026-06-01T10:00:00.000Z',
  trainerName: 'Nino Beridze',
  trainerId: 'tr-1',
  trainerAvatarUrl: 'https://pub.example.com/gym-1/trainers/nino.jpg',
  locationName: '',
  capacity: 12,
  bookedCount: 4,
  category: 'Yoga',
  color: '#2563eb',
  imageUrl: null,
});

describe('class card trainer identity', () => {
  it('carries the trainer id and avatar alongside the name', () => {
    const parsed = classInstanceCardSchema.parse(card());
    expect(parsed.trainerId).toBe('tr-1');
    expect(parsed.trainerAvatarUrl).toBe('https://pub.example.com/gym-1/trainers/nino.jpg');
  });

  it('accepts a class with no trainer as nulls, not empty strings', () => {
    const parsed = classInstanceCardSchema.parse({
      ...card(),
      trainerName: '',
      trainerId: null,
      trainerAvatarUrl: null,
    });
    expect(parsed.trainerId).toBeNull();
    expect(parsed.trainerAvatarUrl).toBeNull();
  });

  it('rejects an avatar that is not a URL, so the API must null it first', () => {
    expect(() =>
      classInstanceCardSchema.parse({ ...card(), trainerAvatarUrl: '/uploads/nino.jpg' }),
    ).toThrow();
  });
});
