'use client';

import { type FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { BlogAuthor } from '@fit/types';
import { Banner, Button, Card, ConfirmDialog, EmptyState, Field, TextareaField } from '@fit/ui-kit';
import { createBlogAuthorAction, deleteBlogAuthorAction, updateBlogAuthorAction } from '../actions';
import { ImageField } from '../image-field';

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
  fields: {
    display: 'grid',
    gridTemplateColumns: '8rem 1fr',
    gap: '1rem',
    alignItems: 'start',
    '@media (max-width: 40rem)': {
      gridTemplateColumns: '1fr',
    },
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
    gap: '0.75rem',
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
  who: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    minWidth: 0,
  },
  avatar: {
    width: '2.5rem',
    height: '2.5rem',
    flexShrink: 0,
    borderRadius: '50%',
    objectFit: 'cover',
    backgroundColor: 'var(--color-background-surface)',
  },
  names: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.125rem',
    minWidth: 0,
  },
  name: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  secondary: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

interface Draft {
  name: string;
  photoUrl: string | null;
  bioKa: string;
  bioEn: string;
}

const EMPTY: Draft = { name: '', photoUrl: null, bioKa: '', bioEn: '' };

function toBody(draft: Draft) {
  return {
    name: draft.name.trim(),
    photoUrl: draft.photoUrl,
    bioKa: draft.bioKa.trim() || null,
    bioEn: draft.bioEn.trim() || null,
  };
}

function AuthorFields({
  draft,
  onChange,
  onError,
  disabled,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onError: (message: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div {...stylex.props(styles.fields)}>
      <ImageField
        label="Photo"
        square
        value={draft.photoUrl}
        onChange={(photoUrl) => onChange({ ...draft, photoUrl })}
        onError={onError}
        disabled={disabled}
      />
      <div {...stylex.props(styles.stack)}>
        <Field
          label="Name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          required
          maxLength={120}
          disabled={disabled}
        />
        <div {...stylex.props(styles.grid)}>
          <TextareaField
            label="Bio (KA)"
            rows={3}
            value={draft.bioKa}
            onChange={(event) => onChange({ ...draft, bioKa: event.target.value })}
            maxLength={1000}
            disabled={disabled}
          />
          <TextareaField
            label="Bio (EN)"
            rows={3}
            value={draft.bioEn}
            onChange={(event) => onChange({ ...draft, bioEn: event.target.value })}
            maxLength={1000}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Blog authors: the bylines a post can carry. Deleting one leaves their posts
 * without a byline (the API sets null).
 */
export function AuthorsManager({ authors }: { authors: BlogAuthor[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [deleting, setDeleting] = useState<BlogAuthor | null>(null);

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createBlogAuthorAction(toBody(draft));
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
      const result = await updateBlogAuthorAction(editing.id, toBody(editing.draft));
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
      const result = await deleteBlogAuthorAction(deleting.id);
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
          <h2 {...stylex.props(styles.sectionTitle)}>New author</h2>
          <AuthorFields draft={draft} onChange={setDraft} onError={setError} disabled={pending} />
          <div {...stylex.props(styles.actions)}>
            <Button type="submit" variant="primary" size="card" label="Add" loading={pending} />
          </div>
        </form>
      </Card>

      {authors.length === 0 ? (
        <EmptyState title="No authors yet" body="Add one above to credit posts to them." />
      ) : (
        <div {...stylex.props(styles.list)}>
          {authors.map((author) => (
            <Card key={author.id} padding="sm">
              {editing?.id === author.id ? (
                <form onSubmit={update} {...stylex.props(styles.stack)}>
                  <AuthorFields
                    draft={editing.draft}
                    onChange={(next) => setEditing({ id: author.id, draft: next })}
                    onError={setError}
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
                  <div {...stylex.props(styles.who)}>
                    {author.photoUrl ? (
                      <img src={author.photoUrl} alt="" {...stylex.props(styles.avatar)} />
                    ) : (
                      <span aria-hidden {...stylex.props(styles.avatar)} />
                    )}
                    <div {...stylex.props(styles.names)}>
                      <span {...stylex.props(styles.name)}>{author.name}</span>
                      <span {...stylex.props(styles.secondary)}>
                        {author.postCount} {author.postCount === 1 ? 'post' : 'posts'}
                      </span>
                    </div>
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
                          id: author.id,
                          draft: {
                            name: author.name,
                            photoUrl: author.photoUrl,
                            bioKa: author.bioKa ?? '',
                            bioEn: author.bioEn ?? '',
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
                      onClick={() => setDeleting(author)}
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
        title={`Delete ${deleting?.name ?? ''}?`}
        description={
          deleting && deleting.postCount > 0
            ? `${deleting.postCount} post(s) credit them. They stay, without a byline.`
            : 'No posts credit them.'
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
