'use client';

// The dashboard's segment tab bar.
//
// Not `@fit/ui-web`'s `Tabs`: that primitive is Tailwind-classed and this screen
// is on the Tailwind guardrail's migrated manifest. The ARIA contract is the
// same one it implements — `role="tablist"`, roving `tabindex` so Tab enters the
// bar once, arrow/Home/End to move within it, automatic activation — restyled in
// StyleX.
//
// Distinct from Astryx's `SegmentedControl`, which this screen already uses for
// the period filter. Segments here are dashboard sections, not a value picker.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { DASHBOARD_SEGMENTS, type DashboardSegment } from '@fit/types';
import { useRovingTablist } from './use-roving-tablist';

const styles = stylex.create({
  list: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  tab: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    marginBottom: '-1px',
    borderWidth: 0,
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'transparent',
    backgroundColor: 'transparent',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transitionProperty: 'color, border-color',
    transitionDuration: '0.15s',
    outline: 'none',
    ':hover': { color: 'var(--color-text-primary)' },
    ':focus-visible': { outline: '2px solid var(--color-accent)', outlineOffset: '-2px' },
  },
  // Dark mode wears the raw brand accent, exactly as before; light mode wears
  // the brand gradient - the label as gradient-clipped text, the underline via
  // `border-image` from the same `--brand-fill-image` (which is `none` in dark,
  // so there the plain border-color and solid accent ink stand). Literals and
  // the image var rather than `--color-text-accent`, so nothing downstream (the
  // palette playground remixes that token at runtime) can shift the dark tab
  // off the accent.
  active: {
    borderBottomColor: 'light-dark(#285d43, var(--color-accent))',
    borderImageSource: 'var(--brand-fill-image, none)',
    borderImageSlice: 1,
    color: 'light-dark(transparent, var(--color-accent))',
    backgroundImage: 'var(--brand-fill-image, none)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
  },
});

export function SegmentTabs({
  active,
  onSelect,
}: {
  active: DashboardSegment;
  onSelect: (segment: DashboardSegment) => void;
}) {
  const t = useTranslations('admin.dashboard.segments');
  const { registerRef, onKeyDown } = useRovingTablist(DASHBOARD_SEGMENTS, onSelect);

  return (
    <div role="tablist" aria-label={t('aria')} {...stylex.props(styles.list)}>
      {DASHBOARD_SEGMENTS.map((segment, index) => {
        const isActive = segment === active;
        return (
          <button
            key={segment}
            id={`dashboard-tab-${segment}`}
            aria-controls="dashboard-tabpanel"
            ref={registerRef(index)}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(segment)}
            onKeyDown={(event) => onKeyDown(event, index)}
            {...stylex.props(styles.tab, isActive && styles.active)}
          >
            {t(segment)}
          </button>
        );
      })}
    </div>
  );
}
