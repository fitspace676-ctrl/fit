import { describe, expect, it } from 'vitest';
import { PERMISSION_MATRIX_SECTIONS } from '@fit/types';
import { en, ka } from '@fit/i18n';

const FIELD_KEYS = [
  'name',
  'surname',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  // The membership's own start day. Added with `startDatePolicy` below, which is
  // meaningless without it — pin the label so the toggle that arms that window
  // cannot go missing the way `personalId` once did.
  'startDate',
  // National ID had a schema flag but no Settings control, so it could never be
  // switched on — which silently broke intake parity between the roster and the
  // POS till. Pin its label so the toggle cannot go missing again.
  'personalId',
  'address',
  'emergencyContact',
  'membershipPlan',
  'paymentMethod',
  'medicalNotes',
] as const;

describe('member-intake settings i18n', () => {
  for (const locale of [en, ka] as const) {
    const m = locale.admin.settings.membership;
    it('has title/subtitle/requiredWarning + every field label', () => {
      expect(typeof m.title).toBe('string');
      expect(typeof m.subtitle).toBe('string');
      expect(typeof m.requiredWarning).toBe('string');
      for (const key of FIELD_KEYS) expect(typeof m.fields[key]).toBe('string');
    });
    it('no longer has grace-period keys', () => {
      expect('gracePeriodLabel' in m).toBe(false);
    });
  }
});

/**
 * The start-date window's own copy. Every key is pinned because two of them do
 * work no other setting's copy does: `maxDaysAheadToday` is the sentence that
 * stops `0` reading as "disabled", and `disabledHint` is what tells a gym why the
 * controls are inert. A missing label here would leave the card silently wrong
 * rather than visibly broken.
 */
const START_DATE_POLICY_KEYS = [
  'title',
  'subtitle',
  'maxDaysAheadLabel',
  'maxDaysAheadHint',
  'maxDaysAheadToday',
  'maxDaysAheadDays',
  'allowPastLabel',
  'allowPastDesc',
  'disabledHint',
] as const;

describe('start-date window settings i18n', () => {
  for (const locale of [en, ka] as const) {
    const policy = locale.admin.settings.startDatePolicy as Record<string, unknown>;
    it.each(START_DATE_POLICY_KEYS)('has "%s"', (key) => {
      expect(typeof policy[key]).toBe('string');
    });
  }

  it('interpolates the day count rather than hard-coding a number', () => {
    for (const locale of [en, ka] as const) {
      expect(locale.admin.settings.startDatePolicy.maxDaysAheadDays).toContain('{days}');
    }
  });
});

/**
 * The Roles & permissions editor's copy.
 *
 * Every string on that screen is pinned, in both locales, for a reason the other
 * sections do not have: the matrix rows are named by `labelKey`s that live in
 * `@fit/types` and point OUTSIDE this section — into the console's own `nav` and
 * `navGroups` groups, reused verbatim so the screen reads in the shape of the
 * sidebar. A rename over there would leave a permission row labelled with a raw
 * key here, and nothing in `@fit/types` can see the catalogue to stop it. This
 * test is that link.
 */
const PERMISSIONS_KEYS = [
  'title',
  'subtitle',
  'rolesLabel',
  'lockedAria',
  // The padlock's explanation. Without it the disabled screen reads as broken
  // rather than as deliberate, which is the whole point of drawing OWNER at all.
  'ownerNoticeTitle',
  'ownerNoticeBody',
  'granted',
  'grantedAria',
  'reset',
  'resetAria',
  'branchScope.legend',
  'branchScope.hint',
  'branchScope.all.title',
  'branchScope.all.hint',
  'branchScope.assigned.title',
  'branchScope.assigned.hint',
  'matrix.capability',
  'matrix.view',
  'matrix.manage',
  // The single-column resources' one wide toggle is labelled with this; a missing
  // value would leave three rows with an unnamed control.
  'matrix.access',
  'matrix.cellLabel',
  'matrix.pairHint',
  'matrix.singleHint',
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

describe('roles & permissions settings i18n', () => {
  for (const locale of [en, ka] as const) {
    it('has the section rail label', () => {
      expect(typeof messageAt(locale, 'admin.settings.sections.permissions')).toBe('string');
    });

    it.each(PERMISSIONS_KEYS)('has "%s"', (key) => {
      expect(typeof messageAt(locale, `admin.settings.permissions.${key}`)).toBe('string');
    });

    it('names every matrix section and row through its contract labelKey', () => {
      for (const section of PERMISSION_MATRIX_SECTIONS) {
        expect(
          typeof messageAt(locale, `admin.${section.labelKey}`),
          `admin.${section.labelKey}`,
        ).toBe('string');
        for (const row of section.rows) {
          expect(typeof messageAt(locale, `admin.${row.labelKey}`), `admin.${row.labelKey}`).toBe(
            'string',
          );
        }
      }
    });

    it('reuses the staff console’s role names, descriptions and head-count', () => {
      for (const role of ['OWNER', 'MANAGER', 'RECEPTIONIST', 'TRAINER'] as const) {
        expect(typeof messageAt(locale, `admin.staff.roles.${role}`)).toBe('string');
        expect(typeof messageAt(locale, `admin.staff.roleDesc.${role}`)).toBe('string');
      }
      expect(typeof messageAt(locale, 'admin.staff.rolesPermissions.staffCount')).toBe('string');
    });
  }

  it('interpolates the tally and the cell label rather than hard-coding them', () => {
    for (const locale of [en, ka] as const) {
      const p = locale.admin.settings.permissions;
      expect(p.granted).toContain('{granted}');
      expect(p.granted).toContain('{total}');
      expect(p.grantedAria).toContain('{granted}');
      expect(p.grantedAria).toContain('{total}');
      expect(p.matrix.cellLabel).toContain('{resource}');
      expect(p.matrix.cellLabel).toContain('{column}');
      expect(p.resetAria).toContain('{role}');
    }
  });
});
