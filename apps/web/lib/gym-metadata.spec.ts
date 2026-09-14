import { describe, expect, it } from 'vitest';
import { gymMetadata, gymViewport } from './gym-metadata';

const downtown = {
  name: 'Downtown Strength',
  logoUrl: 'https://media.test/g1/brand/logo.png',
  themeColor: '#ff5500',
};

describe('gymMetadata', () => {
  it("titles, describes and icons a tenant's site as its gym", () => {
    const metadata = gymMetadata(downtown);
    expect(metadata.title).toEqual({
      default: 'Downtown Strength',
      template: '%s · Downtown Strength',
    });
    expect(metadata.description).toContain('Downtown Strength');
    expect(metadata.icons).toEqual({ icon: downtown.logoUrl, apple: downtown.logoUrl });
    expect(metadata.openGraph).toMatchObject({
      title: 'Downtown Strength',
      siteName: 'Downtown Strength',
      images: [downtown.logoUrl],
    });
  });

  it('keeps the FormaCore icon for a gym that has uploaded no mark', () => {
    expect(gymMetadata({ ...downtown, logoUrl: null }).icons).toEqual({
      icon: '/icon.png',
      apple: '/icon.png',
    });
  });

  it('is plain FormaCore with no gym in scope', () => {
    const metadata = gymMetadata(null);
    expect(metadata.title).toEqual({ default: 'FormaCore', template: '%s · FormaCore' });
    expect(metadata.icons).toEqual({ icon: '/icon.png', apple: '/icon.png' });
    expect(JSON.stringify(metadata)).not.toContain('Downtown');
  });
});

describe('gymViewport', () => {
  it("tints the browser with the gym's chosen colour, and leaves it alone otherwise", () => {
    expect(gymViewport(downtown)).toEqual({ themeColor: '#ff5500' });
    expect(gymViewport({ ...downtown, themeColor: null })).toEqual({});
    expect(gymViewport(null)).toEqual({});
  });
});
