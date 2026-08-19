'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { MAX_PRODUCT_CATEGORY_NAME, type AdminProductCategory } from '@fit/types';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout } from '@astryxdesign/core/Layout';
import { LayoutContent } from '@astryxdesign/core/Layout';
import { Button } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { useSlideDrawer } from '@/hooks/use-slide-drawer';
import {
  createProductCategoryAction,
  deleteProductCategoryAction,
  renameProductCategoryAction,
} from './actions';

const styles = stylex.create({
  drawer: {
    height: 'calc(100dvh - 1.5rem)',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-body)',
    boxShadow: 'var(--shadow-high)',
  },
  icon: {
    width: '1rem',
    height: '1rem',
  },
  header: {
    paddingBlock: '0.5rem',
  },
  content: {
    padding: '1.5rem',
  },
  body: {
    display: 'flex',
    minHeight: '100%',
    flexDirection: 'column',
    gap: '1.25rem',
  },
  intro: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  addRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  input: {
    height: '2.75rem',
    width: '100%',
    minWidth: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.875rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.625rem 0.75rem',
  },
  rowName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  count: {
    flexShrink: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  empty: {
    margin: 0,
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-accent-muted)',
    padding: '1.25rem',
    fontSize: '0.8125rem',
    color: 'var(--color-text-accent)',
  },
  error: {
    margin: 0,
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-danger-muted, var(--color-warning-muted))',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-error, var(--color-warning))',
  },
  confirm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border-emphasized)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.75rem',
  },
  confirmText: {
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  confirmActions: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/** How a row is being edited — at most one row at a time. */
type RowMode =
  | { kind: 'rename'; id: string; draft: string }
  | { kind: 'confirm'; id: string }
  | null;

/**
 * The catalog's category manager: add a shelf, rename one, or delete one.
 *
 * Categories come in from the server (the `/shop` page already fetches them for the
 * filter), and each mutation calls `router.refresh()` so the list, the roster, and
 * the product form's picker all re-read from one source rather than this drawer
 * keeping a second copy in sync.
 *
 * Deleting is confirmed inline rather than in a nested dialog — a dialog on top of a
 * drawer is a focus-trap fight, and the count of affected products is the only thing
 * the confirmation needs to say.
 */
export function CategoriesDrawer({ categories }: { categories: AdminProductCategory[] }) {
  const router = useRouter();
  const drawer = useSlideDrawer();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<RowMode>(null);
  const [error, setError] = useState<string | null>(null);

  /** Run a category mutation, surfacing its error inline and refreshing on success. */
  function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    done: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        done();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function add(event: React.FormEvent): void {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run(
      () => createProductCategoryAction({ name: trimmed }),
      () => setName(''),
    );
  }

  function saveRename(id: string, draft: string): void {
    const trimmed = draft.trim();
    if (!trimmed) return;
    run(
      () => renameProductCategoryAction(id, { name: trimmed }),
      () => setMode(null),
    );
  }

  function remove(id: string): void {
    run(
      () => deleteProductCategoryAction(id),
      () => setMode(null),
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        size="block"
        label="Categories"
        icon={<Icon name="tag" sw={2} {...stylex.props(styles.icon)} />}
        onClick={drawer.open}
      />

      <Dialog
        isOpen={drawer.isOpen}
        onOpenChange={drawer.handleOpenChange}
        purpose="info"
        aria-label="Categories"
        width="26rem"
        maxHeight="100dvh"
        position={{ top: '0.75rem', right: '0.75rem', bottom: '0.75rem' }}
        padding={6}
        xstyle={[styles.drawer, drawer.motion]}
      >
        <Layout
          height="fill"
          header={
            <DialogHeader
              title="Categories"
              hasDivider={false}
              onOpenChange={drawer.handleOpenChange}
              xstyle={styles.header}
            />
          }
          content={
            <LayoutContent padding={0} isScrollable xstyle={styles.content}>
              <div {...stylex.props(styles.body)}>
                <p {...stylex.props(styles.intro)}>
                  Shelves you can file products under. Deleting one keeps its products - they just
                  become uncategorised.
                </p>

                <form onSubmit={add} {...stylex.props(styles.addRow)}>
                  <input
                    aria-label="New category name"
                    id="new-category-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={MAX_PRODUCT_CATEGORY_NAME}
                    placeholder="e.g. Protein"
                    autoComplete="off"
                    {...stylex.props(styles.input)}
                  />
                  <Button
                    variant="primary"
                    size="card"
                    type="submit"
                    disabled={pending || !name.trim()}
                    label="Add"
                  />
                </form>

                {error ? (
                  <p role="alert" {...stylex.props(styles.error)}>
                    {error}
                  </p>
                ) : null}

                {categories.length === 0 ? (
                  <p {...stylex.props(styles.empty)}>
                    No categories yet. Add one above, then pick it on any product.
                  </p>
                ) : (
                  <div {...stylex.props(styles.list)}>
                    {categories.map((category) => {
                      const renaming = mode?.kind === 'rename' && mode.id === category.id;
                      const confirming = mode?.kind === 'confirm' && mode.id === category.id;

                      if (confirming) {
                        return (
                          <div key={category.id} {...stylex.props(styles.confirm)}>
                            <p {...stylex.props(styles.confirmText)}>
                              Delete “{category.name}”?{' '}
                              {category.productCount === 0
                                ? 'No products are filed under it.'
                                : `${category.productCount} product${
                                    category.productCount === 1 ? '' : 's'
                                  } will become uncategorised.`}
                            </p>
                            <div {...stylex.props(styles.confirmActions)}>
                              <Button
                                variant="destructive"
                                size="inline"
                                onClick={() => remove(category.id)}
                                disabled={pending}
                                label="Delete"
                              />
                              <Button
                                variant="secondary"
                                size="inline"
                                onClick={() => setMode(null)}
                                disabled={pending}
                                label="Cancel"
                              />
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={category.id} {...stylex.props(styles.row)}>
                          {renaming ? (
                            <>
                              <input
                                aria-label={`Rename ${category.name}`}
                                value={mode.draft}
                                onChange={(event) =>
                                  setMode({
                                    kind: 'rename',
                                    id: category.id,
                                    draft: event.target.value,
                                  })
                                }
                                maxLength={MAX_PRODUCT_CATEGORY_NAME}
                                autoFocus
                                {...stylex.props(styles.input)}
                              />
                              <Button
                                variant="primary"
                                size="inline"
                                onClick={() => saveRename(category.id, mode.draft)}
                                disabled={pending || !mode.draft.trim()}
                                label="Save"
                              />
                              <Button
                                variant="ghost"
                                size="inline"
                                onClick={() => setMode(null)}
                                disabled={pending}
                                label="Cancel"
                              />
                            </>
                          ) : (
                            <>
                              <span {...stylex.props(styles.rowName)}>{category.name}</span>
                              <span {...stylex.props(styles.count)}>
                                {category.productCount}{' '}
                                {category.productCount === 1 ? 'product' : 'products'}
                              </span>
                              <Button
                                variant="ghost"
                                size="inline"
                                onClick={() =>
                                  setMode({ kind: 'rename', id: category.id, draft: category.name })
                                }
                                disabled={pending}
                                label="Rename"
                              />
                              <Button
                                variant="ghost"
                                size="inline"
                                onClick={() => setMode({ kind: 'confirm', id: category.id })}
                                disabled={pending}
                                label="Delete"
                              />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </LayoutContent>
          }
        />
      </Dialog>
    </>
  );
}
