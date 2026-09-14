import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertOwnedMedia, isOwnedMediaReference, MEDIA_NOT_OWNED_CODE } from './media-ownership';

describe('isOwnedMediaReference', () => {
  it("accepts a public URL under the gym's own prefix", () => {
    expect(isOwnedMediaReference('https://cdn.example.com/gym-1/products/a.jpg', 'gym-1')).toBe(
      true,
    );
  });

  it('accepts a bare key under the prefix', () => {
    expect(isOwnedMediaReference('gym-1/trainers/a.jpg', 'gym-1')).toBe(true);
  });

  it('judges by path, not host, so a moved public domain still resolves', () => {
    expect(isOwnedMediaReference('https://media.formacore.io/gym-1/logos/x.png', 'gym-1')).toBe(
      true,
    );
  });

  it("refuses another gym's object, as a URL or a bare key", () => {
    expect(isOwnedMediaReference('https://cdn.example.com/gym-2/products/a.jpg', 'gym-1')).toBe(
      false,
    );
    expect(isOwnedMediaReference('gym-2/products/a.jpg', 'gym-1')).toBe(false);
  });

  it('refuses a URL outside any gym prefix', () => {
    expect(isOwnedMediaReference('https://images.example.com/photo.jpg', 'gym-1')).toBe(false);
    expect(isOwnedMediaReference('https://cdn.example.com/', 'gym-1')).toBe(false);
  });

  it('refuses a gym id that is only a prefix of the segment', () => {
    expect(isOwnedMediaReference('gym-10/products/a.jpg', 'gym-1')).toBe(false);
  });

  it('refuses a key that climbs out of the prefix', () => {
    expect(isOwnedMediaReference('gym-1/../gym-2/products/a.jpg', 'gym-1')).toBe(false);
    expect(isOwnedMediaReference('https://cdn.example.com/gym-1/../gym-2/a.jpg', 'gym-1')).toBe(
      false,
    );
  });

  it('treats null and blank as "no image"', () => {
    expect(isOwnedMediaReference(null, 'gym-1')).toBe(true);
    expect(isOwnedMediaReference(undefined, 'gym-1')).toBe(true);
    expect(isOwnedMediaReference('  ', 'gym-1')).toBe(true);
  });
});

describe('assertOwnedMedia', () => {
  it('passes when every reference is owned or empty', () => {
    expect(() =>
      assertOwnedMedia('gym-1', ['https://cdn/gym-1/products/a.jpg', null, '']),
    ).not.toThrow();
  });

  it('throws 400 MEDIA_NOT_OWNED when any reference is foreign', () => {
    let caught: unknown;
    try {
      assertOwnedMedia('gym-1', ['https://cdn/gym-1/products/a.jpg', 'https://cdn/gym-2/b.jpg']);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect((caught as BadRequestException).getResponse()).toMatchObject({
      code: MEDIA_NOT_OWNED_CODE,
    });
  });

  it('lets a reference the record already stores through unchanged', () => {
    const legacy = 'https://images.example.com/photo.jpg';
    expect(() => assertOwnedMedia('gym-1', [legacy], [legacy])).not.toThrow();
    expect(() => assertOwnedMedia('gym-1', [legacy, 'https://cdn/gym-2/b.jpg'], [legacy])).toThrow(
      BadRequestException,
    );
  });
});
