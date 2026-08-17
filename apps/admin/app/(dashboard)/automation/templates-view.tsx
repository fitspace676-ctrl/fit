'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { AutomationRuleRow } from '@fit/types';
import { Badge, Button, Card } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { RuleFormDialog } from './rule-form-dialog';
import { ACTION_ICONS, CATEGORY_KEY, CATEGORY_TONES, triggerCategory } from './automation-meta';

const styles = stylex.create({
  /** Icon size inside a kit `Button`. */
  kitGlyph: { height: '1rem', width: '1rem' },
  grid: {
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 640px)': 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  card: {
    height: '100%',
  },
  cardInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    height: '100%',
    alignItems: 'flex-start',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  icon: {
    display: 'grid',
    height: '2.5rem',
    width: '2.5rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  iconSvg: {
    width: '1.25rem',
    height: '1.25rem',
  },
  name: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  actionIcon: {
    width: '0.875rem',
    height: '0.875rem',
    flexShrink: 0,
  },
  spacer: {
    flex: 1,
  },
  emptyWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    textAlign: 'center',
    paddingBlock: '3rem',
  },
  emptyIcon: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  emptyIconSvg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '24rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * The Templates gallery (T12.6): every saved template as a card. "Use template"
 * opens the create builder seeded from the template's trigger/action config, so
 * a new rule starts pre-filled and the manager only reviews and saves.
 */
export function TemplatesView({
  templates,
  canManage,
}: {
  templates: AutomationRuleRow[];
  canManage: boolean;
}) {
  const t = useTranslations('admin.automation');
  const [seed, setSeed] = useState<AutomationRuleRow | null>(null);

  if (templates.length === 0) {
    return (
      <div {...stylex.props(styles.emptyWrap)}>
        <span {...stylex.props(styles.emptyIcon)}>
          <Icon name="star" {...stylex.props(styles.emptyIconSvg)} />
        </span>
        <p {...stylex.props(styles.emptyTitle)}>{t('templates.emptyTitle')}</p>
        <p {...stylex.props(styles.emptyHint)}>{t('templates.emptyHint')}</p>
      </div>
    );
  }

  return (
    <>
      <div {...stylex.props(styles.grid)}>
        {templates.map((template) => {
          const category = triggerCategory(template.triggerType);
          return (
            <Card key={template.id} xstyle={styles.card}>
              <div {...stylex.props(styles.cardInner)}>
                <div {...stylex.props(styles.head)}>
                  <span {...stylex.props(styles.icon)}>
                    <Icon name="bolt" {...stylex.props(styles.iconSvg)} />
                  </span>
                  <span {...stylex.props(styles.name)}>{template.name}</span>
                </div>
                <Badge
                  tone={CATEGORY_TONES[category]}
                  label={t(`categories.${CATEGORY_KEY[category]}`)}
                />
                <span {...stylex.props(styles.action)}>
                  <Icon
                    name={ACTION_ICONS[template.actionType]}
                    {...stylex.props(styles.actionIcon)}
                  />
                  {t(`triggers.${template.triggerType}`)} → {t(`actions.${template.actionType}`)}
                </span>
                <span {...stylex.props(styles.spacer)} />
                {canManage ? (
                  <Button
                    variant="secondary"
                    size="inline"
                    onClick={() => setSeed(template)}
                    icon={<Icon name="plus" {...stylex.props(styles.kitGlyph)} />}
                    label={t('templates.use')}
                  />
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      {seed ? <RuleFormDialog mode="create" seed={seed} onClose={() => setSeed(null)} /> : null}
    </>
  );
}
