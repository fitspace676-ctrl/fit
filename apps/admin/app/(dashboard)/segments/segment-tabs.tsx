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
import { useTheme } from '@/components/theme/theme-provider';
import { useRovingTablist } from './use-roving-tablist';

const styles = stylex.create({
  list: {
    display: 'flex',
    gap: '0.25rem',
    overflowX: 'auto',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    // No rule under the bar in light mode — the active pill alone carries the
    // state; dark keeps the theme's hairline under its underline tabs.
    borderBottomColor: 'light-dark(transparent, var(--color-border))',
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
  // The active tab, dark mode: the flat accent ink + underline, exactly as the
  // theme ships it.
  active: {
    borderBottomColor: 'var(--color-accent)',
    color: 'var(--color-text-accent)',
  },
  // The active tab, light mode: a brand pill — the raw brand lime
  // (`--color-accent`, #E4F26A) as the fill with the theme's on-accent ink
  // (#131312), the same pairing the member portal's active nav pill wears.
  // A separate style applied per theme (not `light-dark()`) because the pill's
  // radius is a length, which `light-dark()` cannot carry — and dark must keep
  // its straight underline.
  activeLight: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    borderBottomColor: 'transparent',
    borderRadius: '9999px',
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
  const { theme } = useTheme();
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
            {...stylex.props(
              styles.tab,
              isActive && styles.active,
              isActive && theme === 'light' && styles.activeLight,
            )}
          >
            {t(segment)}
          </button>
        );
      })}
    </div>
  );
}
