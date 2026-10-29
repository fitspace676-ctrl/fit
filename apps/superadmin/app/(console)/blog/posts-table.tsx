'use client';

import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import type { AdminBlogPost } from '@fit/types';
import { Badge, DataTable, EmptyState, type Column } from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import { VISIBILITY, formatWhen } from './shared';

const styles = stylex.create({
  titleCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    fontWeight: 600,
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
  },
  meta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.375rem',
  },
  slug: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  secondary: {
    color: 'var(--color-text-secondary)',
  },
  when: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  actionsCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.375rem',
  },
});

const COLUMNS: ReadonlyArray<Column<AdminBlogPost>> = [
  {
    key: 'title',
    header: 'Title',
    cell: (post) => (
      <div {...stylex.props(styles.titleCell)}>
        <Link href={`/blog/${post.id}`} {...stylex.props(styles.title)}>
          {post.titleKa}
        </Link>
        <div {...stylex.props(styles.meta)}>
          {post.availableLangs.map((lang) => (
            <Badge key={lang} label={lang.toUpperCase()} tone="neutral" />
          ))}
          <span {...stylex.props(styles.slug)}>/{post.slug}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    cell: (post) => (
      <Badge label={VISIBILITY[post.visibility].label} tone={VISIBILITY[post.visibility].tone} />
    ),
  },
  {
    key: 'category',
    header: 'Category',
    xstyle: styles.secondary,
    cell: (post) => post.category?.nameEn ?? '—',
  },
  {
    key: 'author',
    header: 'Author',
    xstyle: styles.secondary,
    cell: (post) => post.author?.name ?? '—',
  },
  {
    key: 'publishAt',
    header: 'Publish at',
    xstyle: styles.when,
    cell: (post) => formatWhen(post.publishAt),
  },
  {
    key: 'updatedAt',
    header: 'Updated',
    xstyle: styles.when,
    cell: (post) => formatWhen(post.updatedAt),
  },
  {
    key: 'actions',
    header: '',
    align: 'right',
    cell: (post) => (
      <div {...stylex.props(styles.actionsCell)}>
        <ButtonLink href={`/blog/${post.id}`} label="Edit" variant="secondary" size="inline" />
        <ButtonLink
          href={`/blog/${post.id}/preview`}
          label="Preview"
          variant="ghost"
          size="inline"
        />
      </div>
    ),
  },
];

/** One page of posts. Filtering and paging are links resolved on the server. */
export function PostsTable({ posts, filtered }: { posts: AdminBlogPost[]; filtered: boolean }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={posts}
      rowKey={(post) => post.id}
      caption="Blog posts"
      empty={
        filtered ? (
          <EmptyState title="No posts match" body="Try a different search or clear the filters." />
        ) : (
          <EmptyState
            title="No posts yet"
            body="Write the first one with New post. It stays a draft until you publish it."
          />
        )
      }
    />
  );
}
