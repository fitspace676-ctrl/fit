// @fit/admin — the banner manager's derived state, its route gate and its copy.
//
// Three things are worth pinning about this screen and none of them are the view:
//
//   * WHICH reason a row gives for not being on the phone. The member listing
//     (`apps/api/src/banners/banners.service.ts`) applies four conditions at once;
//     the console has to pick one to show, and a badge that said "Scheduled" about
//     a banner nobody switched on would send an operator to the wrong control.
//   * That `/marketing/banners` is GATED. It is a new route with no entry of its
//     own in `ROUTE_PERMISSIONS` — it inherits the `/marketing` prefix — and an
//     inherited gate is exactly the kind that disappears when someone tightens the
//     table without noticing the child.
//   * That every string it draws exists in BOTH locales, since a console screen
//     that renders raw `admin.marketing.banners.…` keys still "works".

import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';
import { Permission, type Banner } from '@fit/types';
import { routeGuardForPath } from '@/lib/route-guards';
import { BANNER_STATUS_TONES, bannerStatus, type BannerStatus } from './banner-status';

const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

/** A live banner — every condition satisfied — that each case then breaks one of. */
function banner(overrides: Partial<Banner> = {}): Banner {
  return {
    id: 'ban_1',
    gymId: 'gym_1',
    title: 'Summer membership',
    imageUrl: 'https://cdn.example.com/gym_1/banners/a.jpg',
    linkUrl: '/shop',
    sortOrder: 0,
    isActive: true,
    startsAt: null,
    endsAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('what a banner row reads as', () => {
  it('is live when it is switched on, has artwork and has no window', () => {
    expect(bannerStatus(banner(), NOW)).toBe('live');
  });

  it('is live inside an open window', () => {
    const state = bannerStatus(
      banner({
        startsAt: new Date(NOW - HOUR).toISOString(),
        endsAt: new Date(NOW + HOUR).toISOString(),
      }),
      NOW,
    );
    expect(state).toBe('live');
  });

  it('is a draft with no artwork, whatever else is set', () => {
    // The state that outranks everything: without an image there is no slide to
    // draw, so "off" or "expired" would name a fixable problem that is not the one.
    expect(bannerStatus(banner({ imageUrl: '', isActive: false }), NOW)).toBe('draft');
    expect(
      bannerStatus(banner({ imageUrl: '', endsAt: new Date(NOW - HOUR).toISOString() }), NOW),
    ).toBe('draft');
  });

  it('is off when the switch is down, even inside its window', () => {
    const state = bannerStatus(
      banner({ isActive: false, startsAt: new Date(NOW - HOUR).toISOString() }),
      NOW,
    );
    expect(state).toBe('off');
  });

  it('is expired once the end has passed, and scheduled before the start', () => {
    expect(bannerStatus(banner({ endsAt: new Date(NOW - HOUR).toISOString() }), NOW)).toBe(
      'expired',
    );
    expect(bannerStatus(banner({ startsAt: new Date(NOW + HOUR).toISOString() }), NOW)).toBe(
      'scheduled',
    );
  });

  it('agrees with the API on both edges of the window', () => {
    // The member listing is `startsAt <= now` and `endsAt > now`. A banner whose
    // start is exactly now is already running; one whose end is exactly now has
    // already stopped. Off by one either way and the console contradicts the phone.
    expect(bannerStatus(banner({ startsAt: new Date(NOW).toISOString() }), NOW)).toBe('live');
    expect(bannerStatus(banner({ endsAt: new Date(NOW).toISOString() }), NOW)).toBe('expired');
  });

  it('prefers the past to the future when a window is entirely behind us', () => {
    const state = bannerStatus(
      banner({
        startsAt: new Date(NOW - 3 * HOUR).toISOString(),
        endsAt: new Date(NOW - HOUR).toISOString(),
      }),
      NOW,
    );
    expect(state).toBe('expired');
  });

  it('has a badge tone for every state it can return', () => {
    const states: BannerStatus[] = ['draft', 'off', 'expired', 'scheduled', 'live'];
    for (const state of states) {
      expect(BANNER_STATUS_TONES[state]).toBeTypeOf('string');
    }
  });
});

describe('the banner route', () => {
  it('is gated on MarketingRead through the /marketing prefix', () => {
    expect(routeGuardForPath('/marketing/banners')?.permission).toBe(Permission.MarketingRead);
  });

  it('is gated the same way behind the /admin base path', () => {
    expect(routeGuardForPath('/admin/marketing/banners')?.permission).toBe(
      Permission.MarketingRead,
    );
  });
});

/**
 * Every key the two banner components resolve, flat-listed rather than derived.
 *
 * Derived would only re-check the shape of the catalogue against itself; the point
 * is to name what the JSX asks for, so deleting a string that a `t('…')` call still
 * makes fails here rather than on the screen.
 */
const BANNER_KEYS = [
  'heading',
  'subheading',
  'caption',
  'newBanner',
  'untitled',
  'noLink',
  'columns.order',
  'columns.banner',
  'columns.link',
  'columns.window',
  'columns.status',
  'columns.active',
  'status.draft',
  'status.off',
  'status.expired',
  'status.scheduled',
  'status.live',
  'windowAlways',
  'windowOpenStart',
  'windowOpenEnd',
  'moveUp',
  'moveDown',
  'moveUpFor',
  'moveDownFor',
  'activateFor',
  'deactivateFor',
  'activated',
  'deactivated',
  'edit',
  'editFor',
  'delete',
  'deleteFor',
  'deleteTitle',
  'deleteMessage',
  'deleted',
  'cancel',
  'saving',
  'created',
  'updated',
  'invalid',
  'windowInvalid',
  'emptyTitle',
  'emptyHintWrite',
  'emptyHintRead',
  'addTitle',
  'editTitle',
  'addDescription',
  'editDescription',
  'addSubmit',
  'editSubmit',
  'titleLabel',
  'titleHint',
  'titlePlaceholder',
  'linkLabel',
  'linkHint',
  'linkPlaceholder',
  'startsAtLabel',
  'startsAtHint',
  'endsAtLabel',
  'endsAtHint',
  'activeLabel',
  'activeHint',
  'image.label',
  'image.alt',
  'image.none',
  'image.choose',
  'image.replace',
  'image.discard',
  'image.hint',
  'image.errorType',
  'image.errorSize',
  'image.errorUpload',
  'image.errorNetwork',
] as const;

/** Read a dotted key path out of a message catalogue, or `undefined`. */
function messageAt(root: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        typeof node === 'object' && node !== null
          ? (node as Record<string, unknown>)[key]
          : undefined,
      root,
    );
}

describe('banner manager i18n', () => {
  for (const locale of [en, ka] as const) {
    it.each(BANNER_KEYS)('has "%s"', (key) => {
      expect(typeof messageAt(locale, `admin.marketing.banners.${key}`)).toBe('string');
    });

    it('names the shell tab and the not-found error', () => {
      expect(typeof messageAt(locale, 'admin.marketing.shellTabs.banners')).toBe('string');
      expect(typeof messageAt(locale, 'admin.marketing.errors.bannerNotFound')).toBe('string');
    });

    it('interpolates the banner name and the upload status rather than hard-coding them', () => {
      for (const key of ['moveUpFor', 'moveDownFor', 'editFor', 'deleteFor', 'deleteMessage']) {
        expect(messageAt(locale, `admin.marketing.banners.${key}`)).toContain('{name}');
      }
      expect(messageAt(locale, 'admin.marketing.banners.image.errorUpload')).toContain('{status}');
    });
  }
});
