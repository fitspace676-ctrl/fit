import { describe, expect, it } from 'vitest';
import { gymMetadata, gymViewport } from './gym-metadata';

const downtown = {
  name: 'Downtown Strength',
  logoUrl: 'https://media.test/logo.png',
  themeColor: '#111111',
};

describe('gymMetadata', () => {
  it('titles and icons the console as the gym it manages', () => {
    const metadata = gymMetadata(downtown);
    expect(metadata.title).toEqual({
      default: 'Downtown Strength — Staff console',
      template: '%s · Downtown Strength',
    });
    expect(metadata.icons).toEqual({ icon: downtown.logoUrl, apple: downtown.logoUrl });
    expect(metadata.openGraph).toMatchObject({ siteName: 'Downtown Strength' });
  });

  it('is plain FormaCore, with the bundled icon, with no gym in scope', () => {
    const metadata = gymMetadata(null);
    expect(metadata.title).toEqual({
      default: 'FormaCore — Staff console',
      template: '%s · FormaCore',
    });
    expect(metadata.icons).toEqual({ icon: '/icon.png', apple: '/icon.png' });
  });
});

describe('gymViewport', () => {
  it('tints the browser only when there is a gym colour', () => {
    expect(gymViewport(downtown)).toEqual({ themeColor: '#111111' });
    expect(gymViewport(null)).toEqual({});
  });
});
