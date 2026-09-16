import { describe, expect, it } from 'vitest';
import {
  GYM_WIDE_REPORT_KEYS,
  REPORT_CATALOG,
  REPORT_KEYS,
  REPORT_METRIC_DEFINITIONS,
} from '@fit/types';
import {
  GYM_WIDE_DRILLDOWNS,
  GYM_WIDE_REPORTS,
  gymWideColumnKeys,
  gymWideSectionColumnKeys,
  reportsWithinBranchAccess,
} from './branch-scope';

describe('branch scope', () => {
  // The caveat and the API read one list. A copy here is how the two drifted
  // apart once already: the console kept marking reports the API had started
  // filtering.
  it('marks exactly the reports the API leaves gym-wide', () => {
    expect([...GYM_WIDE_REPORTS].sort()).toEqual([...GYM_WIDE_REPORT_KEYS].sort());
  });

  // A branch-restricted operator has no gym-wide view, so the reports that cannot
  // be narrowed are not offered to them at all.
  it('drops the gym-wide reports from a restricted catalogue only', () => {
    const catalogue = REPORT_CATALOG;
    const restricted = reportsWithinBranchAccess(catalogue, { canSelectAll: false });
    const keys = restricted.map((report) => report.key);
    for (const key of GYM_WIDE_REPORT_KEYS) {
      expect(keys).not.toContain(key);
    }
    // Everything else stays: only a key on the gym-wide list is dropped (not every
    // gym-wide key is offered in the catalogue, so count what is, not the list).
    expect(restricted).toHaveLength(
      catalogue.filter(
        (report) => !(GYM_WIDE_REPORT_KEYS as readonly string[]).includes(report.key),
      ).length,
    );
    expect(reportsWithinBranchAccess(catalogue, { canSelectAll: true })).toEqual(catalogue);
  });

  it('holds only real catalogue keys', () => {
    for (const key of GYM_WIDE_REPORTS) {
      expect(REPORT_KEYS).toContain(key);
    }
  });

  it('no longer carries the reports Stage 6 made branch-aware', () => {
    expect(GYM_WIDE_REPORTS.has('pt-sessions')).toBe(false);
    expect(GYM_WIDE_REPORTS.has('trainer-performance')).toBe(false);
  });

  it('has no whole drill-down or report column that stays gym-wide', () => {
    expect(GYM_WIDE_DRILLDOWNS.size).toBe(0);
    for (const key of REPORT_KEYS) {
      expect(gymWideColumnKeys(key)).toEqual([]);
    }
  });

  // A review is written about a trainer and carries no branch.
  it('records the staff rating as the one blind drill-down column', () => {
    expect(gymWideSectionColumnKeys('staff', 'staff-performance')).toEqual(['rating']);
    expect(gymWideSectionColumnKeys('staff', 'classes-taught-per-trainer')).toEqual([]);
    expect(Object.keys(REPORT_METRIC_DEFINITIONS)).toContain('staff');
  });
});
