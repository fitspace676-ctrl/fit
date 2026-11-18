import { describe, expect, it } from 'vitest';
import { gymMetadata, gymViewport } from './gym-metadata';

const downtown = {
  name: 'Downtown Strength',
  logoUrl: 'https://media.test/g1/brand/logo.png',
  faviconUrl: null,
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

  it('uses the uploaded tab icon in the tab, and keeps the logo on the share card', () => {
    const icon = 'https://media.test/g1/logos/icon.png';
    const metadata = gymMetadata({ ...downtown, faviconUrl: icon });
    expect(metadata.icons).toEqual({ icon, apple: icon });
    expect(metadata.openGraph).toMatchObject({ images: [downtown.logoUrl] });
  });

  it('keeps the FormaCore icon for a gym that has uploaded no mark', () => {
    expect(gymMetadata({ ...downtown, logoUrl: null }).icons).toEqual({
      icon: '/icon.png?v=2',
      apple: '/icon.png?v=2',
    });
  });

  it('is plain FormaCore with no gym in scope', () => {
    const metadata = gymMetadata(null);
    expect(metadata.title).toEqual({ default: 'FormaCore', template: '%s · FormaCore' });
    expect(metadata.icons).toEqual({ icon: '/icon.png?v=2', apple: '/icon.png?v=2' });
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

describe('Synergy metadata', () => {
  const synergy = {
    name: 'Synergy',
    skinSlug: 'synergy',
    logoUrl: null,
    faviconUrl: null,
    themeColor: null,
  };
  it('falls back to the brand icon for tab, apple and share images', () => {
    const metadata = gymMetadata(synergy);
    expect(metadata.icons).toEqual({
      icon: '/brands/synergy/icon.png',
      apple: '/brands/synergy/icon.png',
    });
    expect(metadata.openGraph).toMatchObject({ images: ['/brands/synergy/icon.png'] });
  });
  it('keeps uploaded assets ahead of the skin', () => {
    const metadata = gymMetadata({
      ...synergy,
      logoUrl: '/uploaded.png',
      faviconUrl: '/favicon.png',
    });
    expect(metadata.icons).toEqual({ icon: '/favicon.png', apple: '/favicon.png' });
    expect(metadata.openGraph).toMatchObject({ images: ['/uploaded.png'] });
    expect(gymMetadata({ ...synergy, logoUrl: '/uploaded.png' }).icons).toEqual({
      icon: '/uploaded.png',
      apple: '/uploaded.png',
    });
  });
  it('uses the page backgrounds for browser chrome, independent of action accent', () => {
    expect(gymViewport({ ...synergy, themeColor: '#ff5500' })).toEqual({
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#F3EDE3' },
        { media: '(prefers-color-scheme: dark)', color: '#1C1C1E' },
      ],
    });
  });
});
