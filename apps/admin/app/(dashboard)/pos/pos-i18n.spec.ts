import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';

/**
 * The till's member panel renders its copy through `next-intl`, which falls back to
 * printing the raw key when one is missing. A missing key is therefore not a crash
 * that a smoke test would catch — it is a button reading `admin.pos.member.addNew`
 * in front of a customer. Pin the ones the add-member drawer depends on.
 */
const MEMBER_KEYS = [
  'searchLabel',
  'searchPlaceholder',
  'walkIn',
  'remove',
  'addNew',
  'addNewTitle',
  'createAndAttach',
] as const;

describe('POS member-panel i18n', () => {
  for (const locale of [en, ka] as const) {
    it('has every key the member lookup and add-member drawer render', () => {
      const member = locale.admin.pos.member;
      for (const key of MEMBER_KEYS) {
        expect(typeof member[key]).toBe('string');
        expect(member[key]).not.toBe('');
      }
    });
  }
});
