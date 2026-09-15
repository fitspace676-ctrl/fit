'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import type { ServiceCategory } from '@fit/types';
import { Button } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { createServiceCategoryAction, deleteServiceCategoryAction } from './actions';

const styles = stylex.create({
  panel: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  hint: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-text-secondary)' },
  form: { display: 'flex', alignItems: 'flex-end', gap: '0.75rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.375rem', flexGrow: 1 },
  label: { fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' },
  input: {
    height: '2.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.9375rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    padding: '0.625rem 0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  rowText: { display: 'flex', flexDirection: 'column', gap: '0.125rem', minWidth: 0 },
  name: { fontWeight: 600, color: 'var(--color-text-primary)' },
  count: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  empty: {
    margin: 0,
    paddingBlock: '1rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  error: { margin: 0, fontSize: '0.8125rem', color: 'var(--color-error)' },
  actions: { display: 'flex', justifyContent: 'flex-start', paddingTop: '0.5rem' },
  glyph: { width: '1rem', height: '1rem' },
});

/**
 * The drawer's "Create category" step: the gym's categories with how many
 * services each files, a name box to add one, and delete on the ones nothing
 * uses. A category in use keeps its delete disabled with the reason in the
 * title, so nothing can vanish from a service behind the desk's back.
 */
export function CategoryPanel({
  categories,
  onChanged,
  onBack,
}: {
  categories: ServiceCategory[];
  /** The drawer keeps the list, so the form's picker sees a new category at once. */
  onChanged: (categories: ServiceCategory[]) => void;
  onBack: () => void;
}) {
  const t = useTranslations('admin.services.categories');
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createServiceCategoryAction({ name });
      if (result.ok) {
        onChanged([...categories, result.data].sort((a, b) => a.name.localeCompare(b.name)));
        setName('');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function remove(category: ServiceCategory): void {
    setError(null);
    startTransition(async () => {
      const result = await deleteServiceCategoryAction(category.id);
      if (result.ok) {
        onChanged(categories.filter((item) => item.id !== category.id));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div {...stylex.props(styles.panel)}>
      <p {...stylex.props(styles.hint)}>{t('hint')}</p>

      <form onSubmit={add} {...stylex.props(styles.form)}>
        <div {...stylex.props(styles.field)}>
          <label htmlFor="service-category-name" {...stylex.props(styles.label)}>
            {t('name')}
          </label>
          <input
            id="service-category-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            required
            placeholder={t('placeholder')}
            {...stylex.props(styles.input)}
          />
        </div>
        <Button
          variant="primary"
          size="page"
          type="submit"
          disabled={pending || name.trim() === ''}
          label={t('add')}
        />
      </form>

      {error ? (
        <p role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      ) : null}

      {categories.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t('empty')}</p>
      ) : (
        <ul aria-label={t('listAria')} {...stylex.props(styles.list)}>
          {categories.map((category) => {
            const inUse = category.serviceCount > 0;
            return (
              <li key={category.id} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowText)}>
                  <span {...stylex.props(styles.name)}>{category.name}</span>
                  <span {...stylex.props(styles.count)}>
                    {t('serviceCount', { count: category.serviceCount })}
                  </span>
                </span>
                <span title={inUse ? t('inUse') : undefined}>
                  <Button
                    variant="ghost"
                    size="inline"
                    disabled={pending || inUse}
                    onClick={() => remove(category)}
                    icon={<Icon name="x" {...stylex.props(styles.glyph)} />}
                    label={t('delete', { name: category.name })}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div {...stylex.props(styles.actions)}>
        <Button variant="secondary" size="page" type="button" onClick={onBack} label={t('back')} />
      </div>
    </div>
  );
}
