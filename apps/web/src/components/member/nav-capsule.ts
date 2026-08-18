import * as stylex from '@stylexjs/stylex';

/**
 * The shape of one control inside the floating nav capsule.
 *
 * Shared rather than local to `bottom-nav.tsx` because the capsule holds two
 * kinds of thing that must be indistinguishable: six destinations, which are
 * links, and the account control, which is a popover trigger. They live in
 * different files — the account menu carries a session, a sign-out and a panel —
 * and if each drew its own pill they would drift on the first change to a
 * padding step. Everything visual about a capsule control is here; the two call
 * sites supply only behaviour.
 */
export const navCapsule = stylex.create({
  item: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    cursor: 'pointer',
    // Icon-only on the narrowest screens: a circle, so the capsule keeps its
    // shape rather than becoming a row of squashed pills.
    //
    // The padding is the only part of this row that can give, and at 0.875rem it
    // did not give enough: seven 46px targets, their gaps, the capsule's own rim
    // and the 58px bell beside it came to more than a 360px screen has, so the
    // capsule ran off both edges.
    //
    // The budget, if these ever move again: the capsule is `152 + 14 × padding`
    // px wide, and the rail also has to fit the 58px bell, one 8px gap and its
    // own 12px gutters — so `padding ≤ (viewport − 242) / 14`. That is what puts
    // the steps at 390 and not at a rounder number: 0.625rem needs 382px.
    paddingInline: {
      default: '0.5rem',
      '@media (min-width: 390px)': '0.625rem',
      '@media (min-width: 640px)': '1rem',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  idle: {
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
  },
  active: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    height: '1.125rem',
    width: '1.125rem',
    flexShrink: 0,
  },
  // Below `sm` the labels cannot fit; the icons carry it, and the label stays in
  // the accessible name rather than disappearing entirely.
  label: {
    display: {
      default: 'none',
      '@media (min-width: 640px)': 'inline',
    },
  },
});
