import * as stylex from '@stylexjs/stylex';
import { Avatar, Badge, ButtonLink, Card } from '@/src/components/ui/kit';
import { useTranslations } from 'next-intl';
import type { TrainerDetail } from '@fit/types';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11), now on the portal kit: the profile header is rebuilt on the kit's `Card` /
// `Avatar` / `Badge` / `Button` over the FormaCore theme, with the layout and the
// decorative accent band authored in compiled StyleX (`var(--color-*)`) — no
// Tailwind utilities and no formacore Aurora-glass primitives. The Astryx
// `Avatar` renders the initials fallback from `name`, so the Dicebear helper is
// gone.

const styles = stylex.create({
  card: {
    position: 'relative',
    overflow: 'hidden',
    padding: {
      default: '1.5rem',
      '@media (min-width: 640px)': '2rem',
    },
  },
  band: {
    position: 'absolute',
    insetInline: 0,
    top: 0,
    height: '7rem',
    backgroundColor: 'var(--color-accent-muted)',
    pointerEvents: 'none',
  },
  section: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  headRow: {
    display: 'flex',
    flexDirection: {
      default: 'column',
      '@media (min-width: 640px)': 'row',
    },
    alignItems: {
      default: 'flex-start',
      '@media (min-width: 640px)': 'center',
    },
    gap: '1.25rem',
  },
  headText: {
    minWidth: 0,
    flex: 1,
  },
  nameRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  name: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: {
      default: '1.5rem',
      '@media (min-width: 640px)': '1.875rem',
    },
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  headline: {
    marginTop: '0.25rem',
    marginBottom: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  bio: {
    margin: 0,
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    lineHeight: 1.65,
    color: 'var(--color-text-secondary)',
  },
  facet: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  facetLabel: {
    margin: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--color-text-secondary)',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  locations: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  locationIcon: {
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-disabled)',
  },
  badgeIcon: {
    height: '0.875rem',
    width: '0.875rem',
  },
});

export interface TrainerProfileProps {
  trainer: TrainerDetail;
  /** Aggregate review rating (0–5) and count, surfaced as a header badge. */
  avgRating?: number;
  reviewCount?: number;
}

/**
 * The profile header of a trainer's detail page: avatar (Astryx initials
 * fallback when there's no photo), name + headline, the full (untruncated) bio,
 * the specialty / location facets the index card only summarised, and a primary
 * action linking to the trainer's upcoming sessions. Purely presentational — the
 * page owns the layout and the data fetch.
 */
export function TrainerProfile({ trainer, avgRating = 0, reviewCount = 0 }: TrainerProfileProps) {
  const t = useTranslations('trainers');

  return (
    <Card padding="none" xstyle={styles.card}>
      <span aria-hidden {...stylex.props(styles.band)} />

      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.headRow)}>
          <Avatar src={trainer.avatarUrl ?? undefined} name={trainer.name} size={96} />
          <div {...stylex.props(styles.headText)}>
            <div {...stylex.props(styles.nameRow)}>
              <h1 {...stylex.props(styles.name)}>{trainer.name}</h1>
              {reviewCount > 0 && (
                <Badge
                  tone="pending"
                  icon={<Icon name="star" {...stylex.props(styles.badgeIcon)} />}
                  label={avgRating.toFixed(1)}
                />
              )}
            </div>
            {trainer.headline && <p {...stylex.props(styles.headline)}>{trainer.headline}</p>}
          </div>
          <ButtonLink
            href="#trainer-schedule-heading"
            variant="primary"
            size="card"
            icon={<Icon name="calendarPlus" {...stylex.props(styles.badgeIcon)} sw={2} />}
            label={t('detail.schedule.title')}
          />
        </div>

        {trainer.bio && <p {...stylex.props(styles.bio)}>{trainer.bio}</p>}

        {trainer.specialties.length > 0 && (
          <div {...stylex.props(styles.facet)}>
            <h2 {...stylex.props(styles.facetLabel)}>{t('detail.specialties')}</h2>
            <ul aria-label={t('detail.specialties')} {...stylex.props(styles.chips)}>
              {trainer.specialties.map((specialty) => (
                <li key={specialty}>
                  <Badge tone="neutral" label={specialty} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {trainer.locationNames.length > 0 && (
          <div {...stylex.props(styles.facet)}>
            <h2 {...stylex.props(styles.facetLabel)}>{t('detail.locations')}</h2>
            <p {...stylex.props(styles.locations)}>
              <Icon name="pin" {...stylex.props(styles.locationIcon)} sw={2} />
              {trainer.locationNames.join(' · ')}
            </p>
          </div>
        )}
      </section>
    </Card>
  );
}
