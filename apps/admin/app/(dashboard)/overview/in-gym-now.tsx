'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import type { DashboardOverviewResponse } from '@fit/types';
import { Card, CountUp } from '@fit/ui-kit';
import { AnimatedCircularProgressBar } from '../charts';

const pulse = stylex.keyframes({
  '0%': { opacity: 1 },
  '50%': { opacity: 0.35 },
  '100%': { opacity: 1 },
});

const styles = stylex.create({
  occupancyCard: {
    height: '100%',
  },
  livePill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.625rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-accent)',
  },
  liveDot: {
    display: 'inline-block',
    height: '0.375rem',
    width: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'currentColor',
    animationName: pulse,
    animationDuration: '1.6s',
    animationIterationCount: 'infinite',
  },
  donutValue: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1,
  },
  donutNumber: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  donutCaption: {
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  inGymCopy: {
    minWidth: 0,
    flex: 1,
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  areaList: {
    listStyle: 'none',
    margin: 0,
    marginTop: '1.25rem',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  areaValue: {
    whiteSpace: 'nowrap',
  },
});

/* -------------------------------------------------------------------------- */
/*  In the gym now                                                             */
/* -------------------------------------------------------------------------- */

export function InGymNow({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const { current, capacity, areas } = data.inGymNow;
  const pct = capacity > 0 ? Math.round((current / capacity) * 100) : 0;

  return (
    <Card padding="card" xstyle={styles.occupancyCard}>
      <Stack gap={4} height="100%">
        <HStack justify="between" align="center">
          <Text type="label" color="secondary" weight="bold">
            {t('inGymNow.title')}
          </Text>
          <span {...stylex.props(styles.livePill)}>
            <span {...stylex.props(styles.liveDot)} />
            {t('inGymNow.live')}
          </span>
        </HStack>

        <HStack gap={5} align="center">
          <AnimatedCircularProgressBar
            value={current}
            max={capacity}
            size={104}
            stroke={10}
            ariaLabel={t('inGymNow.title')}
          >
            <span {...stylex.props(styles.donutValue)}>
              <span {...stylex.props(styles.donutNumber)}>
                <CountUp to={current} />
              </span>
              <span {...stylex.props(styles.donutCaption)}>{t('inGymNow.of', { capacity })}</span>
            </span>
          </AnimatedCircularProgressBar>
          <p {...stylex.props(styles.inGymCopy)}>
            {current === 0
              ? t('inGymNow.quiet')
              : t('inGymNow.capacity', { pct, areas: areas.length })}
          </p>
        </HStack>

        {areas.length > 0 && (
          <ul {...stylex.props(styles.areaList)}>
            {areas.map((area) => (
              <li key={area.name}>
                <Stack gap={1}>
                  <HStack justify="between" align="center">
                    <Text type="supporting" color="secondary" weight="medium">
                      {area.name}
                    </Text>
                    <Text
                      type="supporting"
                      color="secondary"
                      hasTabularNumbers
                      xstyle={styles.areaValue}
                    >
                      {area.occupancy}/{area.capacity}
                    </Text>
                  </HStack>
                  <ProgressBar
                    value={area.occupancy}
                    max={Math.max(area.capacity, 1)}
                    label={area.name}
                    isLabelHidden
                    variant="success"
                  />
                </Stack>
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </Card>
  );
}
