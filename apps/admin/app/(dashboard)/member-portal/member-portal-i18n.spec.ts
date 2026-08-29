// @fit/admin — Member-portal screen i18n coverage.
//
// The console ships in Georgian, so a key that exists only in `en` renders as a
// raw dotted path to every real user of this screen. `@fit/i18n`'s parity spec
// already guarantees the two catalogues have the SAME key set; what it cannot
// know is which keys this screen needs. So this pins the shape: every card's
// copy, both colour controls, the upload's five failure messages, and the
// preview's sample wording — in both locales.
//
// The interpolation assertions are the half that catches a real bug rather than
// a missing string: `next-intl` throws at render on a placeholder the message
// does not declare, so a translation that drops `{color}` or `{status}` fails in
// production, in one locale only, on a path a developer working in English never
// walks.

import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';

/** Top-level keys the screen reads directly. */
const ROOT_KEYS = ['title', 'subtitle'] as const;

const BREADCRUMB_KEYS = ['label', 'home', 'current'] as const;

const COLOR_KEYS = [
  'title',
  'subtitle',
  'primaryLabel',
  'primaryDesc',
  'accentLabel',
  'accentDesc',
  'hexLabel',
  'pickerLabel',
  'inheritedBadge',
  'inherited',
  'customise',
  'reset',
  'invalid',
] as const;

const IMAGE_KEYS = [
  'title',
  'subtitle',
  'label',
  'none',
  'alt',
  'uploading',
  'hint',
  'remove',
  'errorType',
  'errorSize',
  'errorUpload',
  'errorNetwork',
] as const;

const PREVIEW_KEYS = [
  'title',
  'subtitle',
  'signInTitle',
  'emailLabel',
  'emailSample',
  'passwordLabel',
  'forgot',
  'submit',
  'joinTitle',
  'joinBenefit',
  'joinCta',
  'note',
] as const;

const SAVE_BAR_KEYS = ['unsaved', 'discard', 'save', 'saving'] as const;

const ERROR_KEYS = [
  'loadSettings',
  'apiUnreachable',
  'notAuthorized',
  'forbidden',
  'gymNotFound',
  'storageUnavailable',
  'requestFailed',
  'invalid',
  'unexpected',
] as const;

describe('member-portal screen i18n', () => {
  for (const [name, locale] of [
    ['en', en],
    ['ka', ka],
  ] as const) {
    describe(name, () => {
      const portal = locale.admin.memberPortal;

      it('has the page title and subtitle', () => {
        for (const key of ROOT_KEYS) expect(typeof portal[key]).toBe('string');
      });

      it.each([
        ['breadcrumb', BREADCRUMB_KEYS, portal.breadcrumb],
        ['colors', COLOR_KEYS, portal.colors],
        ['image', IMAGE_KEYS, portal.image],
        ['preview', PREVIEW_KEYS, portal.preview],
        ['saveBar', SAVE_BAR_KEYS, portal.saveBar],
        ['errors', ERROR_KEYS, portal.errors],
      ] as const)('has every %s key', (_group, keys, node) => {
        const messages = node as Record<string, unknown>;
        for (const key of keys) {
          expect(typeof messages[key], `missing "${_group}.${key}"`).toBe('string');
        }
      });

      it('keeps every placeholder the screen passes an argument for', () => {
        expect(portal.colors.inherited).toContain('{color}');
        expect(portal.colors.hexLabel).toContain('{label}');
        expect(portal.colors.pickerLabel).toContain('{label}');
        expect(portal.image.errorUpload).toContain('{status}');
        expect(portal.preview.joinTitle).toContain('{gym}');
        expect(portal.errors.loadSettings).toContain('{status}');
        expect(portal.errors.loadSettings).toContain('{message}');
        expect(portal.errors.requestFailed).toContain('{status}');
        expect(portal.errors.requestFailed).toContain('{message}');
      });
    });
  }

  it('names the destination in the sidebar in both locales', () => {
    expect(typeof en.admin.nav.memberPortal).toBe('string');
    expect(typeof ka.admin.nav.memberPortal).toBe('string');
  });
});
