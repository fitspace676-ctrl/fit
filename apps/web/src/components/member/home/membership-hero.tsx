import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';

export interface MembershipHeroProps {
  planName: string | null;
  active: boolean;
  /** Days elapsed / total in the current billing period (for the progress bar). */
  daysUsed: number;
  daysTotal: number;
  memberName: string;
  memberId: string;
}

// FormaCore redesign — THE lime block.
//
// The direction spends its entire colour budget here: this is the one surface in
// the whole portal allowed to be chromatic, and it is chromatic in BOTH themes.
// Everything around it inverts between light and dark; the membership card does
// not move. That is what makes it read as the member's card rather than as a
// panel that happens to be highlighted.
//
// Consequences that look like hardcoding but are not:
//
//   • The block's internal palette is mode-INDEPENDENT (literal hexes, no
//     `light-dark()`), because the block itself never changes mode. Reaching for
//     `--color-text-primary` inside it would flip the copy to white in dark mode
//     — on a lime fill, that is ~1.5:1.
//   • Type on the block is always ink-950. `--color-on-accent` says the same
//     thing and is used where a token is available; the literals below are the
//     same value for the surfaces Astryx does not tokenise.
//
// Gone with the Aurora-glass skin: the 135° indigo→pink gradient, the blurred
// white "aura" blob, and the coloured drop shadow. The direction bans all three
// — the block is flat, and its size is what gives it weight.

/** The one lime, and the ink that is legible on it. Both mode-independent. */
const LIME = 'var(--color-accent)';
const ON_LIME = '#131312';

const styles = stylex.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    // The hero step of the radius ladder (32px) — the largest silhouette in the
    // system, reserved for exactly this block and the login screen's class card.
    borderRadius: 'var(--radius-page)',
    padding: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.75rem',
    },
    color: ON_LIME,
    backgroundColor: LIME,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  eyebrow: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    // Ink-800 rather than a lighter lime: a tint of the block colour muddies it,
    // while ink simply recedes.
    color: '#2B2B29',
  },
  // Solid ink carrying LIME type — not white. The artboards use the block's own
  // colour as the pill's ink, which ties the badge to the surface it sits on
  // instead of reading as a foreign white chip dropped onto it.
  status: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: ON_LIME,
    color: LIME,
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
  },
  statusIcon: {
    width: '0.8125rem',
    height: '0.8125rem',
  },
  planBlock: {
    marginTop: '1.5rem',
  },
  /** The plan name is the block's headline — top of the weight ramp, cropped tight. */
  planName: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(2.25rem, 5vw, 2.75rem)',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.025em',
    textTransform: 'uppercase',
    color: ON_LIME,
  },
  planMeta: {
    margin: 0,
    marginTop: '0.75rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#2B2B29',
  },
  // Ids are always mono in this product — the QR modal, the account menu and
  // reception's console all print the same string in the same face.
  planMetaId: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  // `mt-auto` pins the progress + actions to the bottom of the block, so the
  // card keeps its shape whether the plan name wraps to one line or two.
  progressBlock: {
    marginTop: 'auto',
    paddingTop: '2rem',
  },
  progressHead: {
    marginBottom: '0.625rem',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: '#2B2B29',
  },
  progressPct: {
    color: '#2B2B29',
  },
  track: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    // A darker lime, not a white/ink wash: the track has to stay part of the
    // block while the fill reads as ink against it.
    backgroundColor: 'rgba(19, 19, 18, 0.15)',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: ON_LIME,
  },
  actions: {
    marginTop: '1.5rem',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  // Both actions invert against the block: the lime is the surface here, so a
  // lime button would vanish into it. Primary is solid ink carrying LIME type
  // (the same inversion as the status pill); secondary is a 10% ink wash, which
  // reads as "also available" without introducing a third material.
  actionPrimary: {
    display: 'inline-flex',
    height: '2.75rem',
    alignItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: { default: ON_LIME, ':hover': '#2B2B29' },
    color: LIME,
    paddingInline: '1.5rem',
    fontSize: '0.875rem',
    fontWeight: 700,
    textDecoration: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  actionSecondary: {
    display: 'inline-flex',
    height: '2.75rem',
    alignItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'rgba(19, 19, 18, 0.10)',
      ':hover': 'rgba(19, 19, 18, 0.16)',
    },
    color: ON_LIME,
    paddingInline: '1.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
});

/**
 * The dashboard's flagship card: the member's membership as a flat lime block —
 * plan, billing-period progress, and the two actions the artboards give it.
 */
export function MembershipHero({
  planName,
  active,
  daysUsed,
  daysTotal,
  memberName,
  memberId,
}: MembershipHeroProps) {
  const t = useTranslations('member.home');
  const pct = daysTotal > 0 ? Math.round((daysUsed / daysTotal) * 100) : 0;

  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.eyebrow)}>{t('membership')}</span>
        <span {...stylex.props(styles.status)}>
          <Icon name={active ? 'check' : 'clock'} sw={2.4} {...stylex.props(styles.statusIcon)} />
          {active ? t('active') : t('noPlan')}
        </span>
      </div>

      <div {...stylex.props(styles.planBlock)}>
        <p {...stylex.props(styles.planName)}>{planName ?? t('noPlan')}</p>
        <p {...stylex.props(styles.planMeta)}>
          {memberName} · <span {...stylex.props(styles.planMetaId)}>{memberId}</span>
        </p>
      </div>

      <div {...stylex.props(styles.progressBlock)}>
        {daysTotal > 0 ? (
          <>
            <div {...stylex.props(styles.progressHead)}>
              <span>{t('daysLeft', { used: daysUsed, total: daysTotal })}</span>
              <span {...stylex.props(styles.progressPct)}>{pct}%</span>
            </div>
            <div {...stylex.props(styles.track)}>
              <div {...stylex.props(styles.fill)} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </>
        ) : null}

        <div {...stylex.props(styles.actions)}>
          <Link href="/member/account/membership" {...stylex.props(styles.actionPrimary)}>
            {t('managePlan')}
          </Link>
          <Link href="/member/account/bookings" {...stylex.props(styles.actionSecondary)}>
            {t('myBookings')}
          </Link>
        </div>
      </div>
    </div>
  );
}
