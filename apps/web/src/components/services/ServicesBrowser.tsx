'use client';

import { useEffect, useMemo, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { ServiceCard as ServiceCardModel, ServiceType } from '@fit/types';
import { Button } from '@/src/components/ui/kit';
import { fetchServices } from '@/lib/services';
import { ServiceCard } from './ServiceCard';

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  chip: {
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-card)',
    color: 'var(--color-text-primary)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipActive: {
    backgroundColor: 'var(--color-accent)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 768px)': 'repeat(2, minmax(0, 1fr))',
    },
    alignItems: 'start',
  },
  status: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-disabled)',
  },
  stateBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
    paddingBlock: '4rem',
    textAlign: 'center',
  },
  stateTitle: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  stateText: { margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' },
});

/** The type filter: everything, or one service type. */
type TypeFilter = 'ALL' | ServiceType;
const TYPE_FILTERS: readonly TypeFilter[] = ['ALL', 'PERSONAL_TRAINING', 'CUSTOM'];

export interface ServicesBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
}

interface LoadState {
  services: ServiceCardModel[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Client orchestrator for the portal's Services page: fetches the gym's
 * catalogue once, owns the type filter, and renders the card grid.
 */
export function ServicesBrowser({ gymId }: ServicesBrowserProps) {
  const t = useTranslations('services');
  const locale = useLocale();
  const [load, setLoad] = useState<LoadState>({ services: [], status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<TypeFilter>('ALL');

  useEffect(() => {
    if (!gymId) {
      setLoad({ services: [], status: 'ready' });
      return;
    }
    const controller = new AbortController();
    setLoad((prev) => ({ services: prev.services, status: 'loading' }));
    fetchServices({ gymId, signal: controller.signal })
      .then((services) => setLoad({ services, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({ services: [], status: 'error' });
      });
    return () => controller.abort();
  }, [gymId, reloadKey]);

  const visible = useMemo(
    () => (filter === 'ALL' ? load.services : load.services.filter((s) => s.type === filter)),
    [load.services, filter],
  );

  if (load.status === 'loading') {
    return <p {...stylex.props(styles.status)}>{t('loading')}</p>;
  }
  if (load.status === 'error') {
    return (
      <div {...stylex.props(styles.stateBlock)}>
        <p {...stylex.props(styles.stateText)}>{t('error')}</p>
        <Button
          variant="secondary"
          size="inline"
          label={t('retry')}
          onClick={() => setReloadKey((key) => key + 1)}
        />
      </div>
    );
  }
  if (load.services.length === 0) {
    return (
      <div {...stylex.props(styles.stateBlock)}>
        <p {...stylex.props(styles.stateTitle)}>{t('empty.title')}</p>
        <p {...stylex.props(styles.stateText)}>{t('empty.subtitle')}</p>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.root)}>
      <ul aria-label={t('filters.label')} {...stylex.props(styles.filters)}>
        {TYPE_FILTERS.map((value) => (
          <li key={value}>
            <button
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              {...stylex.props(styles.chip, filter === value && styles.chipActive)}
            >
              {t(`filters.${value}`)}
            </button>
          </li>
        ))}
      </ul>

      {visible.length === 0 ? (
        <p {...stylex.props(styles.status)}>{t('filters.noMatch')}</p>
      ) : (
        <ul aria-label={t('grid.label')} {...stylex.props(styles.grid)}>
          {visible.map((service) => (
            <li key={service.id}>
              <ServiceCard service={service} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
