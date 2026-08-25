import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import type { ServiceRosterSummary } from '@fit/types';
import { Icon, type IconName } from '@/components/ui';
import { createNumberFormat, defaultLocale } from '@fit/i18n';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (min-width: 1024px)': 'repeat(4, 1fr)',
    },
    gap: '1rem',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: {
      default: '1rem',
      '@media (min-width: 640px)': '1.25rem',
    },
  },
  tileIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  value: {
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  label: {
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  toneBrand: {
    color: 'var(--color-text-accent)',
  },
  toneSuccess: {
    color: 'var(--color-text-accent)',
  },
  toneWarning: {
    color: 'var(--color-warning)',
  },
  toneDanger: {
    color: 'var(--color-error)',
  },
});

/** One summary tile's static config — icon, label, accent tone, and value. */
type Tile = {
  key: string;
  label: string;
  icon: IconName;
  /** StyleX colour style for the tile's icon, mapped from the brand tokens. */
  tone: stylex.StyleXStyles;
  value: string;
};

/**
 * The services catalogue's summary tiles — four at-a-glance counts for the whole
 * filtered set (not just the visible page): how many services exist, the split
 * between personal training and custom services, and how many are archived.
 * Server-rendered from the `GET /admin/services` response `summary`, so the
 * tiles always agree with the list below.
 */
export function ServicesSummary({ summary }: { summary: ServiceRosterSummary }) {
  const { total, personalTraining, custom, archived } = summary;

  const tiles: Tile[] = [
    {
      key: 'total',
      label: 'Services',
      icon: 'spark',
      tone: styles.toneBrand,
      value: createNumberFormat(defaultLocale).format(total),
    },
    {
      key: 'pt',
      label: 'Personal training',
      icon: 'dumbbell',
      tone: styles.toneSuccess,
      value: createNumberFormat(defaultLocale).format(personalTraining),
    },
    {
      key: 'custom',
      label: 'Custom',
      icon: 'tag',
      tone: styles.toneWarning,
      value: createNumberFormat(defaultLocale).format(custom),
    },
    {
      key: 'archived',
      label: 'Archived',
      icon: 'info',
      tone: styles.toneDanger,
      value: createNumberFormat(defaultLocale).format(archived),
    },
  ];

  return (
    <div {...stylex.props(styles.grid)}>
      {tiles.map((tile) => (
        <Card key={tile.key} padding="none" xstyle={styles.tile}>
          <Icon name={tile.icon} {...stylex.props(styles.tileIcon, tile.tone)} />
          <div {...stylex.props(styles.value)}>{tile.value}</div>
          <div {...stylex.props(styles.label)}>{tile.label}</div>
        </Card>
      ))}
    </div>
  );
}
