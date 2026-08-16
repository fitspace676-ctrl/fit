import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Card } from '@astryxdesign/core/Card';
import type { TrainerCard as TrainerCardModel } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { Icon } from '@/src/components/ui';

// Astryx migration (T11.13): the roster card is rebuilt on the Astryx `Card` /
// `Avatar` / `Badge` over the Fit brand theme, with layout authored in compiled
// StyleX (`var(--color-*)`) — no Tailwind utilities and no formacore
// Aurora-glass primitives. The Astryx `Avatar` renders the initials fallback
// from `name`, so the Dicebear helper is gone. Behaviour is unchanged: the whole
// card links to the trainer's detail page.

const styles = stylex.create({
  link: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-container)',
    textDecoration: 'none',
    outline: 'none',
  },
  card: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.25rem',
    backgroundColor: {
      default: 'var(--color-background-card)',
      ':hover': 'var(--color-overlay-hover)',
    },
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '150ms',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  headText: {
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  headline: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  bio: {
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  specialties: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  footer: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    paddingTop: '0.25rem',
  },
  location: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  locationIcon: {
    height: '0.875rem',
    width: '0.875rem',
    flexShrink: 0,
  },
  locationText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  arrow: {
    display: 'inline-flex',
    height: '2rem',
    width: '2rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    color: 'var(--color-text-secondary)',
  },
  arrowIcon: {
    height: '1rem',
    width: '1rem',
  },
});

export interface TrainerCardProps {
  trainer: TrainerCardModel;
}

/**
 * One trainer rendered as a card in the index grid: avatar (Astryx initials
 * fallback when there's no photo), name + headline, a truncated bio, and the
 * specialty chips. The whole card links to the trainer's detail page (T3.7).
 * Purely presentational — the grid owns layout and the filter state lives a
 * level up.
 */
export function TrainerCard({ trainer }: TrainerCardProps) {
  const t = useTranslations('trainers');

  return (
    <Link href={`/member/trainers/${trainer.id}`} {...stylex.props(styles.link)}>
      <Card variant="default" padding={0} xstyle={styles.card}>
        <div {...stylex.props(styles.head)}>
          <Avatar src={trainer.avatarUrl ?? undefined} name={trainer.name} size={60} />
          <div {...stylex.props(styles.headText)}>
            <h2 {...stylex.props(styles.name)}>{trainer.name}</h2>
            {trainer.headline && <p {...stylex.props(styles.headline)}>{trainer.headline}</p>}
          </div>
        </div>

        {trainer.bio && <p {...stylex.props(styles.bio)}>{trainer.bio}</p>}

        {trainer.specialties.length > 0 && (
          <ul aria-label={t('card.specialties')} {...stylex.props(styles.specialties)}>
            {trainer.specialties.map((specialty) => (
              <li key={specialty}>
                <Badge variant="purple" label={specialty} />
              </li>
            ))}
          </ul>
        )}

        <div {...stylex.props(styles.footer)}>
          {trainer.locationNames.length > 0 ? (
            <span {...stylex.props(styles.location)}>
              <Icon name="pin" {...stylex.props(styles.locationIcon)} sw={2} />
              <span {...stylex.props(styles.locationText)}>
                {trainer.locationNames.join(' · ')}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span aria-hidden {...stylex.props(styles.arrow)}>
            <Icon name="arrow" {...stylex.props(styles.arrowIcon)} sw={2.2} />
          </span>
        </div>
      </Card>
    </Link>
  );
}
