'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { BLOG_SLUG_PATTERN, type BlogCategory } from '@fit/types';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Field } from '@fit/ui-kit';
import {
  createBlogCategoryAction,
  deleteBlogCategoryAction,
  updateBlogCategoryAction,
} from '../actions';

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
    gap: '0.75rem',
    alignItems: 'start',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.375rem',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  names: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
  },
  name: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  secondary: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  slug: {
    fontFamily: 'var(--font-family-code)',
  },
});

interface Draft {
  nameKa: string;
  nameEn: string;
  slug: string;
}

const EMPTY: Draft = { nameKa: '', nameEn: '', slug: '' };

/** The three fields of a category, shared by the create and edit forms. */
function CategoryFields({
  draft,
  onChange,
  disabled,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  disabled: boolean;
}) {
  const slugInvalid = draft.slug !== '' && !BLOG_SLUG_PATTERN.test(draft.slug);
  return (
    <div {...stylex.props(styles.grid)}>
      <Field
        label="Name (KA)"
        value={draft.nameKa}
        onChange={(event) => onChange({ ...draft, nameKa: event.target.value })}
        required
        maxLength={80}
        disabled={disabled}
      />
      <Field
        label="Name (EN)"
        value={draft.nameEn}
        onChange={(event) => onChange({ ...draft, nameEn: event.target.value })}
        required
        maxLength={80}
        disabled={disabled}
      />
      <Field
        label="Slug"
        hint={slugInvalid ? 'Lowercase Latin letters, digits and hyphens.' : '/blog?category=…'}
        invalid={slugInvalid}
        value={draft.slug}
        onChange={(event) => onChange({ ...draft, slug: event.target.value.toLowerCase() })}
        required
        maxLength={120}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Blog categories: a create form, then every category with inline edit and
 * delete. Deleting one leaves its posts uncategorised (the API sets null).
 */
export function CategoriesManager({ categories }: { categories: BlogCategory[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<BlogCategory | null>(null);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBlogCategoryAction(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(EMPTY);
      router.refresh();
    });
  }

  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    startTransition(async () => {
      const result = await updateBlogCategoryAction(editing.id, editing.draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function remove() {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBlogCategoryAction(deleting.id);
      if (!result.ok) setError(result.error);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div {...stylex.props(styles.stack)}>
      {error ? <Banner tone="error">{error}</Banner> : null}

      <Card>
        <form onSubmit={create} {...stylex.props(styles.stack)}>
          <h2 {...stylex.props(styles.sectionTitle)}>New category</h2>
          <CategoryFields draft={draft} onChange={setDraft} disabled={pending} />
          <div {...stylex.props(styles.actions)}>
            <Button type="submit" variant="primary" size="card" label="Add" loading={pending} />
          </div>
        </form>
      </Card>

      {categories.length === 0 ? (
        <EmptyState title="No categories yet" body="Add one above, then file posts under it." />
      ) : (
        <div {...stylex.props(styles.list)}>
          {categories.map((category) => (
            <Card key={category.id} padding="sm">
              {editing?.id === category.id ? (
                <form onSubmit={update} {...stylex.props(styles.stack)}>
                  <CategoryFields
                    draft={editing.draft}
                    onChange={(next) => setEditing({ id: category.id, draft: next })}
                    disabled={pending}
                  />
                  <div {...stylex.props(styles.actions)}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="inline"
                      label="Cancel"
                      disabled={pending}
                      onClick={() => setEditing(null)}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="inline"
                      label="Save"
                      loading={pending}
                    />
                  </div>
                </form>
              ) : (
                <div {...stylex.props(styles.row)}>
                  <div {...stylex.props(styles.names)}>
                    <span {...stylex.props(styles.name)}>
                      {category.nameEn} · {category.nameKa}
                    </span>
                    <span {...stylex.props(styles.secondary)}>
                      <span {...stylex.props(styles.slug)}>{category.slug}</span> ·{' '}
                      {category.postCount} {category.postCount === 1 ? 'post' : 'posts'}
                    </span>
                  </div>
                  <div {...stylex.props(styles.actions)}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="inline"
                      label="Edit"
                      disabled={pending}
                      onClick={() =>
                        setEditing({
                          id: category.id,
                          draft: {
                            nameKa: category.nameKa,
                            nameEn: category.nameEn,
                            slug: category.slug,
                          },
                        })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="inline"
                      label="Delete"
                      disabled={pending}
                      onClick={() => setDeleting(category)}
                    />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.nameEn ?? ''}”?`}
        description={
          deleting && deleting.postCount > 0
            ? `${deleting.postCount} post(s) are filed under it. They stay, without a category.`
            : 'No posts use it.'
        }
        cancelLabel="Cancel"
        confirmLabel="Delete"
        confirmVariant="destructive"
        loading={pending}
        onConfirm={remove}
      />
    </div>
  );
}
