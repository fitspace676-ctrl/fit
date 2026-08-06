'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { Badge } from '@astryxdesign/core/Badge';
import { HStack } from '@astryxdesign/core/HStack';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { DashboardKpi } from '@fit/types';
import { CountUp, Icon, type IconName } from '@/components/ui';

const styles = stylex.create({
  kpiCard: {
    height: '100%',
    minHeight: '13rem',
  },
  iconTile: {
    display: 'grid',
    placeItems: 'center',
    height: '2.75rem',
    width: '2.75rem',
    borderRadius: '0.75rem',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 18%, transparent)',
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  deltaMuted: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
});

/* -------------------------------------------------------------------------- */
/*  KPI card                                                                   */
/* -------------------------------------------------------------------------- */

export function KpiCard({
  label,
  icon,
  kpi,
  format,
}: {
  label: string;
  icon: IconName;
  kpi: DashboardKpi;
  format?: (value: number) => string;
}) {
  return (
    <Card variant="default" padding={5} xstyle={styles.kpiCard}>
      <Stack height="100%" justify="between" gap={5}>
        <HStack justify="between" align="center">
          <span {...stylex.props(styles.iconTile)}>
            <Icon name={icon} {...stylex.props(styles.icon)} />
          </span>
          <DeltaChip kpi={kpi} />
        </HStack>
        <Stack gap={1}>
          <Text type="display-3" weight="bold" hasTabularNumbers display="block">
            {format ? format(kpi.value) : <CountUp to={Math.round(kpi.value)} />}
          </Text>
          <Text type="supporting" color="secondary" weight="semibold" display="block">
            {label}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}

/**
 * A secondary "stat card" — like {@link KpiCard} but for a live count with no
 * period-over-period baseline: it shows a static descriptive `hint` (a label, not a
 * fabricated trend) where the delta chip would sit, or nothing when `hint` is omitted.
 */
export function StatKpiCard({
  label,
  icon,
  value,
  hint,
}: {
  label: string;
  icon: IconName;
  value: number;
  hint?: string;
}) {
  return (
    <Card variant="default" padding={5} xstyle={styles.kpiCard}>
      <Stack height="100%" justify="between" gap={5}>
        <HStack justify="between" align="center">
          <span {...stylex.props(styles.iconTile)}>
            <Icon name={icon} {...stylex.props(styles.icon)} />
          </span>
          {hint ? <span {...stylex.props(styles.deltaMuted)}>{hint}</span> : null}
        </HStack>
        <Stack gap={1}>
          <Text type="display-3" weight="bold" hasTabularNumbers display="block">
            <CountUp to={Math.round(value)} />
          </Text>
          <Text type="supporting" color="secondary" weight="semibold" display="block">
            {label}
          </Text>
        </Stack>
      </Stack>
    </Card>
  );
}

function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span {...stylex.props(styles.deltaMuted)}>{t('kpi.noPriorData')}</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <Badge
      variant={good ? 'success' : 'error'}
      label={`${good ? '▲' : '▼'} ${Math.abs(kpi.deltaPct)}%`}
    />
  );
}
