import { describe, expect, it } from 'vitest';
import { createClassTemplateSchema, updateClassTemplateSchema } from './classes-admin';

/**
 * The cover image field on the class-template write bodies. One nullable URL:
 * absent and empty both normalise to null so "no cover" has exactly one
 * representation, and a non-URL string is rejected rather than stored.
 */

const base = () => ({
  title: 'Morning HIIT',
  locationId: 'loc-1',
  capacity: 20,
  durationMinutes: 45,
  startTime: '09:00',
  rrule: 'FREQ=WEEKLY;BYDAY=MO',
  validFrom: '2026-06-01',
});

describe('class template cover imageUrl', () => {
  it('defaults to null when omitted', () => {
    expect(createClassTemplateSchema.parse(base()).imageUrl).toBeNull();
    expect(updateClassTemplateSchema.parse(base()).imageUrl).toBeNull();
  });

  it('keeps a well-formed URL', () => {
    const parsed = createClassTemplateSchema.parse({
      ...base(),
      imageUrl: 'https://pub.example.com/gym/classes/cover.jpg',
    });
    expect(parsed.imageUrl).toBe('https://pub.example.com/gym/classes/cover.jpg');
  });

  it('normalises an empty string to null', () => {
    expect(createClassTemplateSchema.parse({ ...base(), imageUrl: '' }).imageUrl).toBeNull();
  });

  it('rejects a non-URL string', () => {
    expect(createClassTemplateSchema.safeParse({ ...base(), imageUrl: 'not a url' }).success).toBe(
      false,
    );
  });
});
