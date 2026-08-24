import { describe, expect, it } from 'vitest';
import { classInstanceCardSchema, classInstanceDetailSchema } from './classes';

/**
 * The cover image on the member-facing class contract. It rides on the *detail*
 * projection only: the calendar listing is the hottest public query and stays
 * deliberately lean, so a card never carries one.
 */

const detail = () => ({
  id: 'ci-1',
  title: 'Morning Flow',
  description: '',
  startsAt: '2026-06-01T09:00:00.000Z',
  endsAt: '2026-06-01T10:00:00.000Z',
  trainerName: '',
  locationName: '',
  room: '',
  capacity: 12,
  bookedCount: 4,
  durationMinutes: 60,
  category: 'Yoga',
  color: '#2563eb',
  status: 'SCHEDULED' as const,
});

describe('class detail cover imageUrl', () => {
  it('carries a cover URL through the detail contract', () => {
    const parsed = classInstanceDetailSchema.parse({
      ...detail(),
      imageUrl: 'https://pub.example.com/gym-1/classes/cover.jpg',
    });
    expect(parsed.imageUrl).toBe('https://pub.example.com/gym-1/classes/cover.jpg');
  });

  it('accepts a class with no cover as null', () => {
    expect(classInstanceDetailSchema.parse({ ...detail(), imageUrl: null }).imageUrl).toBeNull();
  });

  it('carries the cover on the calendar card too, for the booking modal', () => {
    // The modal opens straight from a calendar card, so the cover has to ride
    // along rather than costing a second round-trip on every click.
    expect(Object.keys(classInstanceCardSchema.shape)).toContain('imageUrl');
  });
});
